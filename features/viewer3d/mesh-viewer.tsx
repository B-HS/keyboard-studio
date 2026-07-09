'use client'

import { FC, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { BufferAttribute, BufferGeometry, GridHelper, Group, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three'
import { cn } from '@lib/utils'
import { createSubtleGrid, createThreeScene, disposeGrid, fitCameraToBoundingSphere, GRID_SIZE_RATIO, ThreeScene } from './three-scene'

type MeshViewerProps = {
    positions: Float32Array
    normals: Float32Array
    className?: string
}

const PLATE_METALNESS = 0.35
const PLATE_ROUGHNESS = 0.55
const LIGHT_PLATE_COLOR = 0xb8bcc2
const DARK_PLATE_COLOR = 0x7a7e85
const GRID_INITIAL_SIZE = 100
const LAY_FLAT_ROTATION_X = -Math.PI / 2

type MeshView = {
    scene: ThreeScene
    group: Group
    mesh: Mesh
    material: MeshStandardMaterial
    grid: GridHelper
}

const plateColor = (theme: string | undefined) => (theme === 'dark' ? DARK_PLATE_COLOR : LIGHT_PLATE_COLOR)

export const MeshViewer: FC<MeshViewerProps> = ({ positions, normals, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const viewRef = useRef<MeshView | null>(null)
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const scene = createThreeScene(canvas)
        const material = new MeshStandardMaterial({ color: plateColor(resolvedTheme), metalness: PLATE_METALNESS, roughness: PLATE_ROUGHNESS })
        const mesh = new Mesh(new BufferGeometry(), material)
        const group = new Group()
        group.rotation.x = LAY_FLAT_ROTATION_X
        group.add(mesh)
        scene.scene.add(group)
        const grid = createSubtleGrid(GRID_INITIAL_SIZE)
        scene.scene.add(grid)
        viewRef.current = { scene, group, mesh, material, grid }
        return () => {
            const view = viewRef.current
            scene.scene.remove(group)
            mesh.geometry.dispose()
            material.dispose()
            if (view) {
                scene.scene.remove(view.grid)
                disposeGrid(view.grid)
            }
            scene.dispose()
            viewRef.current = null
        }
    }, [])

    useEffect(() => {
        const view = viewRef.current
        if (!view || positions.length === 0) return
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(positions, 3))
        geometry.setAttribute('normal', new BufferAttribute(normals, 3))
        geometry.center()
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()

        const previousGeometry = view.mesh.geometry
        view.mesh.geometry = geometry
        previousGeometry.dispose()

        const size = new Vector3()
        geometry.boundingBox?.getSize(size)
        const nextGrid = createSubtleGrid(Math.max(size.x, size.y, 1) * GRID_SIZE_RATIO)
        nextGrid.position.y = -size.z / 2
        view.scene.scene.remove(view.grid)
        disposeGrid(view.grid)
        view.scene.scene.add(nextGrid)
        view.grid = nextGrid

        const radius = geometry.boundingSphere?.radius ?? 1
        fitCameraToBoundingSphere(view.scene.camera, view.scene.controls, new Sphere(new Vector3(), radius))
        view.scene.invalidate()
    }, [positions, normals])

    useEffect(() => {
        const view = viewRef.current
        if (!view) return
        view.material.color.set(plateColor(resolvedTheme))
        view.scene.invalidate()
    }, [resolvedTheme])

    return <canvas ref={canvasRef} className={cn('block h-full w-full', className)} />
}
