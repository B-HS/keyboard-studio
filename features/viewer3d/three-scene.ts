import { AmbientLight, DirectionalLight, GridHelper, Material, PerspectiveCamera, Scene, Sphere, Vector3, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const CAMERA_FOV_DEG = 45
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 5000
const MAX_PIXEL_RATIO = 2
const DEGREES_TO_RADIANS = Math.PI / 180

const AMBIENT_INTENSITY = 0.55
const KEY_LIGHT_INTENSITY = 1.1
const FILL_LIGHT_INTENSITY = 0.4
const RIM_LIGHT_INTENSITY = 0.5
const KEY_LIGHT_POSITION: [number, number, number] = [0.6, 1, 0.8]
const FILL_LIGHT_POSITION: [number, number, number] = [-0.8, 0.6, -0.6]
const RIM_LIGHT_POSITION: [number, number, number] = [0.2, -0.6, -0.9]

const FIT_PADDING = 1.35
const FIT_DIRECTION = new Vector3(0.4, 0.7, 1)
const NEAR_FLOOR = 0.01
const NEAR_RADIUS_RATIO = 0.002
const FAR_DISTANCE_RATIO = 20
const MIN_DOLLY_RADIUS_RATIO = 0.02
const MAX_DOLLY_DISTANCE_RATIO = 4

const GRID_DIVISIONS = 20
const GRID_COLOR = 0x888888
const GRID_OPACITY = 0.12
export const GRID_SIZE_RATIO = 1.6

export type ThreeScene = ReturnType<typeof createThreeScene>

export const createThreeScene = (canvas: HTMLCanvasElement) => {
    const scene = new Scene()

    const camera = new PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR, CAMERA_FAR)
    camera.position.set(0, 0, 1)

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    scene.add(new AmbientLight(0xffffff, AMBIENT_INTENSITY))
    const keyLight = new DirectionalLight(0xffffff, KEY_LIGHT_INTENSITY)
    keyLight.position.set(...KEY_LIGHT_POSITION)
    scene.add(keyLight)
    const fillLight = new DirectionalLight(0xffffff, FILL_LIGHT_INTENSITY)
    fillLight.position.set(...FILL_LIGHT_POSITION)
    scene.add(fillLight)
    const rimLight = new DirectionalLight(0xffffff, RIM_LIGHT_INTENSITY)
    rimLight.position.set(...RIM_LIGHT_POSITION)
    scene.add(rimLight)

    let dirty = true
    let frameHandle = 0

    const invalidate = () => {
        dirty = true
    }
    controls.addEventListener('change', invalidate)

    const resize = () => {
        const width = canvas.clientWidth || 1
        const height = canvas.clientHeight || 1
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
        invalidate()
    }
    resize()

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const tick = () => {
        frameHandle = requestAnimationFrame(tick)
        controls.update()
        if (!dirty) return
        dirty = false
        renderer.render(scene, camera)
    }
    tick()

    const dispose = () => {
        cancelAnimationFrame(frameHandle)
        resizeObserver.disconnect()
        controls.removeEventListener('change', invalidate)
        controls.dispose()
        renderer.dispose()
    }

    return { scene, camera, renderer, controls, invalidate, dispose }
}

const gridMaterials = (grid: GridHelper) => (Array.isArray(grid.material) ? grid.material : [grid.material]) as Material[]

export const createSubtleGrid = (size: number) => {
    const grid = new GridHelper(size, GRID_DIVISIONS, GRID_COLOR, GRID_COLOR)
    for (const material of gridMaterials(grid)) {
        material.opacity = GRID_OPACITY
        material.transparent = true
    }
    return grid
}

export const disposeGrid = (grid: GridHelper) => {
    grid.geometry.dispose()
    for (const material of gridMaterials(grid)) material.dispose()
}

export const fitCameraToBoundingSphere = (camera: PerspectiveCamera, controls: OrbitControls, sphere: Sphere) => {
    const radius = sphere.radius || 1
    const fitRadius = radius * FIT_PADDING
    const distance = fitRadius / Math.sin((camera.fov * DEGREES_TO_RADIANS) / 2)
    const offset = FIT_DIRECTION.clone().normalize().multiplyScalar(distance)
    camera.position.copy(sphere.center).add(offset)
    camera.near = Math.max(fitRadius * NEAR_RADIUS_RATIO, NEAR_FLOOR)
    camera.far = (distance + fitRadius) * FAR_DISTANCE_RATIO
    camera.updateProjectionMatrix()
    controls.target.copy(sphere.center)
    controls.minDistance = fitRadius * MIN_DOLLY_RADIUS_RATIO
    controls.maxDistance = (distance + fitRadius) * MAX_DOLLY_DISTANCE_RATIO
    controls.update()
}
