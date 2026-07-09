'use client'

import { FC, useEffect, useRef, useState } from 'react'
import { Box3, GridHelper, Material, Mesh, Object3D, Sphere, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { cn } from '@lib/utils'
import { createSubtleGrid, createThreeScene, disposeGrid, fitCameraToBoundingSphere, GRID_SIZE_RATIO, ThreeScene } from './three-scene'

type GltfViewerProps = {
    url: string
    className?: string
}

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const

type GltfView = {
    scene: ThreeScene
    loaded: Object3D | null
    grid: GridHelper | null
}

const disposeMaterial = (material: Material) => {
    const record = material as unknown as Record<string, unknown>
    for (const key of TEXTURE_KEYS) {
        const texture = record[key]
        if (texture instanceof Texture) texture.dispose()
    }
    material.dispose()
}

const disposeObject = (object: Object3D) => {
    object.traverse((child) => {
        if (!(child instanceof Mesh)) return
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) disposeMaterial(material)
    })
}

const clearLoaded = (view: GltfView) => {
    if (view.loaded) {
        view.scene.scene.remove(view.loaded)
        disposeObject(view.loaded)
        view.loaded = null
    }
    if (view.grid) {
        view.scene.scene.remove(view.grid)
        disposeGrid(view.grid)
        view.grid = null
    }
}

export const GltfViewer: FC<GltfViewerProps> = ({ url, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const viewRef = useRef<GltfView | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const scene = createThreeScene(canvas)
        viewRef.current = { scene, loaded: null, grid: null }
        return () => {
            const view = viewRef.current
            if (view) clearLoaded(view)
            scene.dispose()
            viewRef.current = null
        }
    }, [])

    useEffect(() => {
        const view = viewRef.current
        if (!view) return
        let cancelled = false
        setLoading(true)
        setError(false)
        new GLTFLoader().load(
            url,
            (gltf) => {
                if (cancelled) {
                    disposeObject(gltf.scene)
                    return
                }
                clearLoaded(view)
                view.scene.scene.add(gltf.scene)
                view.loaded = gltf.scene

                const box = new Box3().setFromObject(gltf.scene)
                const size = new Vector3()
                box.getSize(size)
                const grid = createSubtleGrid(Math.max(size.x, size.z, 1) * GRID_SIZE_RATIO)
                grid.position.y = box.min.y
                view.scene.scene.add(grid)
                view.grid = grid

                fitCameraToBoundingSphere(view.scene.camera, view.scene.controls, box.getBoundingSphere(new Sphere()))
                view.scene.invalidate()
                setLoading(false)
            },
            undefined,
            () => {
                if (cancelled) return
                setError(true)
                setLoading(false)
            },
        )
        return () => {
            cancelled = true
            clearLoaded(view)
            view.scene.invalidate()
        }
    }, [url])

    return (
        <div className={cn('relative h-full w-full', className)}>
            <canvas ref={canvasRef} className='block h-full w-full' />
            {loading && <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>Loading model</div>}
            {error && <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>Failed to load model</div>}
        </div>
    )
}
