import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    CameraControls,
    Sphere,
    TransformControls,
    useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import { ClipPlane } from './ClipPlane';
import { Utils } from './Utils';

function GLBModel({
    activePlane,
    onSelect,
    onModelLoaded,
    onSceneLoaded,
    modelRef,
}) {
    const gltf = useGLTF('/scene.glb');
    const meshRefs = useRef([]);
    const helperRefs = useRef({ plane1: null, plane2: null });
    const { scene, camera, mouse, raycaster } = useThree();

    useEffect(() => {
        meshRefs.current = [];
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                if (child.name === 'mesh_2' && child.parent) {
                    child.parent.remove(child);
                    return;
                }
                if (child.material) {
                    child.material = child.material.clone();
                    child.material.metalness = 0.4;
                    child.material.roughness = 0.6;
                    child.material.side = THREE.DoubleSide;
                    child.material.color = new THREE.Color(0xffffff);
                }
                meshRefs.current.push(child);
            }
        });

        gltf.scene.rotation.y = Math.PI;

        if (onModelLoaded && modelRef.current) {
            const box = new THREE.Box3().setFromObject(modelRef.current);
            onModelLoaded(box);
        }

        // 👇 Pass scene to parent
        if (gltf.scene && typeof onSceneLoaded === 'function') {
            onSceneLoaded(gltf.scene);
        }
    }, [gltf]);

    const removeHelper = (plane) => {
        const helper = helperRefs.current[plane];
        if (helper) {
            scene.remove(helper);
            helper.geometry?.dispose();
            helper.material?.dispose();
            helperRefs.current[plane] = null;
        }
    };

    useFrame(() => {
        if (!activePlane) return;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(meshRefs.current, true);

        meshRefs.current.forEach((mesh) => {
            if (mesh.userData.selectedForPlane) return;
            mesh.material.color.set('white');
        });

        if (intersects.length > 0) {
            const first = intersects[0].object;
            if (!first.userData.selectedForPlane) {
                first.material.color.set('yellow');
            }
        }
    });

    const handlePointerDown = (e) => {
        if (!activePlane) return;
        e.stopPropagation();

        const mesh = e.object;
        if (mesh.userData.selectedForPlane) return;

        mesh.userData.selectedForPlane = activePlane;
        mesh.material.color.set('red');

        const face = e.face;
        if (!face) return;

        const localNormal = face.normal.clone();

        const worldNormal = localNormal
            .applyNormalMatrix(
                new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),
            )
            .normalize();

        const posAttr = mesh.geometry.attributes.position;
        const a = new THREE.Vector3().fromBufferAttribute(posAttr, face.a);
        const b = new THREE.Vector3().fromBufferAttribute(posAttr, face.b);
        const c = new THREE.Vector3().fromBufferAttribute(posAttr, face.c);

        const offsetPoint = new THREE.Vector3()
            .copy(e.point.clone())
            .add(worldNormal.clone().multiplyScalar(5));
        const points = Utils.getMeshIntersectionWithLine(
            mesh,
            offsetPoint.clone(),
            worldNormal.clone().negate(),
        );
        const distance = new THREE.Vector3()
            .copy(points[0].point.clone())
            .distanceTo(points[1].point.clone());
        const midPoint = new THREE.Vector3()
            .copy(points[0].point.clone())
            .add(
                new THREE.Vector3()
                    .copy(worldNormal.clone().negate())
                    .multiplyScalar(distance / 2),
            );
        onSelect?.(activePlane, mesh.name, worldNormal, midPoint);
    };

    return (
        <primitive
            ref={modelRef}
            object={gltf.scene}
            scale={2.5}
            position={[0, 0, 0]}
            onPointerDown={handlePointerDown}
        />
    );
}

// ✅ Plane aligned to given normal
function PerpendicularPlane({ normal, position }) {
    const ref = useRef();
    const size = 5000;

    useEffect(() => {
        if (ref.current && normal) {
            const up = new THREE.Vector3(0, 0, 1);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(
                up,
                normal.clone().normalize(),
            );
            ref.current.quaternion.copy(quaternion);
        }
    }, [normal]);

    return (
        <mesh ref={ref} position={position}>
            <planeGeometry args={[size, size]} />
            <meshBasicMaterial
                color="green"
                side={THREE.DoubleSide}
                transparent
                opacity={0.4}
            />
        </mesh>
    );
}

function NormalArrow({ normal, position, length = 3000, color = 0x00ff00 }) {
    // Create arrow helper only once, memoized
    const arrowHelper = React.useMemo(() => new THREE.ArrowHelper(), []);

    React.useEffect(() => {
        if (normal && position && arrowHelper) {
            arrowHelper.setDirection(normal.clone().normalize());
            arrowHelper.position.copy(position);
            arrowHelper.setLength(length);
            arrowHelper.setColor(new THREE.Color(color));
        }
    }, [normal, position, length, color, arrowHelper]);

    return <primitive object={arrowHelper} />;
}

export default function App() {
    const [activePlane, setActivePlane] = useState(null);
    const [planeSelections, setPlaneSelections] = useState({
        plane1: null,
        plane2: null,
    });
    const [cubePosition, setCubePosition] = useState(
        new THREE.Vector3(0, 0, 0),
    );
    const [aligned, setAligned] = useState(null);
    const [points, setPoints] = useState();

    const glbSceneRef = useRef();
    const boxRef = useRef();
    const groupRef = useRef();
    const cameraControlsRef = useRef();
    const transformControlsRef = useRef();

    useEffect(() => {
        function onResize() {
            const camera = cameraControlsRef.current?.camera;
            if (camera?.isOrthographicCamera) {
                const aspect = window.innerWidth / window.innerHeight;
                const frustumHeight = 1000; // desired size
                camera.left = (-frustumHeight * aspect) / 2;
                camera.right = (frustumHeight * aspect) / 2;
                camera.top = frustumHeight / 2;
                camera.bottom = -frustumHeight / 2;
                camera.updateProjectionMatrix();
            }
        }
        window.addEventListener('resize', onResize);
        onResize();
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // useEffect(() => {
    //     setTimeout(() => {
    //         handleFitToView();
    //     }, 500);
    // }, []);

    const handleSelectPlane1 = () => {
        if (!planeSelections.plane1) setActivePlane('plane1');
    };

    const handleSelectPlane2 = () => {
        if (!planeSelections.plane2) setActivePlane('plane2');
    };

    const handleModelLoaded = (box) => {
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Camera should be placed behind Z based on box size
        const distance = Math.max(size.x, size.y, size.z) * 2;

        const from = center.clone().add(new THREE.Vector3(0, distance, 0));
        const to = center;

        requestAnimationFrame(() => {
            if (cameraControlsRef.current) {
                cameraControlsRef.current.setLookAt(
                    from.x,
                    from.y,
                    from.z,
                    to.x,
                    to.y,
                    to.z,
                    true,
                );
                cameraControlsRef.current.saveState();
            }
        });
    };

    const handleApply = () => {
        setActivePlane(null);

        const plane1 = planeSelections.plane1;
        const plane2 = planeSelections.plane2;

        if (plane1?.normal && plane2?.normal) {
            const mesh = glbSceneRef.current.getObjectByName(plane1.meshName);
            const planeInstance1 = new THREE.Plane();
            planeInstance1.setFromNormalAndCoplanarPoint(
                plane1.normal,
                plane1.centroid,
            );
            const planeInstance2 = new THREE.Plane();
            planeInstance2.setFromNormalAndCoplanarPoint(
                plane2.normal,
                plane2.centroid,
            );
            const planeShape = ClipPlane.getIntersectionContour(
                mesh,
                planeInstance1,
            );
            const point = ClipPlane.getContourPlaneIntersection(
                planeShape,
                planeInstance2,
            );
            if (point.length == 0) {
                const mesh2 = glbSceneRef.current.getObjectByName(
                    plane2.meshName,
                );
                const planeInstance1 = new THREE.Plane();
                planeInstance1.setFromNormalAndCoplanarPoint(
                    plane1.normal,
                    plane1.centroid,
                );
                const planeInstance2 = new THREE.Plane();
                planeInstance2.setFromNormalAndCoplanarPoint(
                    plane2.normal,
                    plane2.centroid,
                );
                const planeShape = ClipPlane.getIntersectionContour(
                    mesh2,
                    planeInstance2,
                );
                const point = ClipPlane.getContourPlaneIntersection(
                    planeShape,
                    planeInstance1,
                );
                setAligned(true);
                setPoints(point);
            } else {
                setAligned(true);
                setPoints(point);
            }
        }
    };

    useEffect(() => {
        if (!points || !aligned) return;
        const angleX = Utils.angleToEqualizeZ(points[0], points[1]);
        Utils.animateRotation(glbSceneRef.current, angleX, 'x', () => {
            const updatedPoints = [...points];
            updatedPoints[0].applyAxisAngle(new THREE.Vector3(1, 0, 0), angleX);
            updatedPoints[1].applyAxisAngle(new THREE.Vector3(1, 0, 0), angleX);
            setPoints(updatedPoints);
            setTimeout(() => {
                const angleZ = Utils.angleZToEqualizeX(points[0], points[1]);
                Utils.animateRotation(groupRef.current, angleZ, 'z');
            }, 1000);
        });
    }, [aligned]);

    const handleFitToView = () => {
        const glbScene = glbSceneRef.current; // We'll set this up below
        const boxMesh = boxRef.current?.parent;

        if (!glbScene && !boxMesh) {
            console.warn('❌ No model found to fit.');
            return;
        }

        const combinedBox = new THREE.Box3();

        if (glbScene) {
            combinedBox.expandByObject(glbScene);
        }

        if (boxMesh) combinedBox.expandByObject(boxMesh);

        const size = new THREE.Vector3();
        combinedBox.getSize(size);
        const center = new THREE.Vector3();
        combinedBox.getCenter(center);

        const distance = Math.max(size.x, size.y, size.z) * 1.5;

        const from = center.clone().add(new THREE.Vector3(0, distance, 0));
        const to = center;

        if (cameraControlsRef.current) {
            cameraControlsRef.current.setLookAt(
                from.x - 7500, // Adjusted to match the offset used in the model
                from.y,
                from.z,
                to.x - 7500,
                to.y,
                to.z,
                true,
            );
            cameraControlsRef.current.saveState();
        }
    };

    const handleMeshSelect = (plane, meshName, normal, centroid) => {
        setPlaneSelections((prev) => ({
            ...prev,
            [plane]: { meshName, normal, centroid },
        }));
        setActivePlane(null);
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            <div
                style={{
                    position: 'absolute',
                    top: 20,
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0 20px',
                }}>
                {/* Left side buttons */}
                <div>
                    <button onClick={handleSelectPlane1}>Select Plane 1</button>
                    <button
                        onClick={handleSelectPlane2}
                        style={{ marginLeft: 10 }}>
                        Select Plane 2
                    </button>
                    <button onClick={handleApply} style={{ marginLeft: 10 }}>
                        Apply
                    </button>
                </div>

                {/* Right side button */}
                <div>
                    <button onClick={handleFitToView}>Fit to View</button>
                </div>
            </div>

            {/* Below the main bar – selections */}
            <div
                style={{
                    position: 'absolute',
                    top: 70,
                    left: 20,
                    zIndex: 10,
                    color: 'white',
                }}>
                Selected:
                <div>Plane 1: {planeSelections.plane1?.meshName || '-'}</div>
                <div>Plane 2: {planeSelections.plane2?.meshName || '-'}</div>
            </div>

            <Canvas
                orthographic
                camera={{
                    zoom: 0.05,
                    near: 1,
                    far: 2000000,
                    position: [0, 0, 0], // will be overridden by setLookAt
                    left: -window.innerWidth / 2,
                    right: window.innerWidth / 2,
                    top: window.innerHeight / 2,
                    bottom: -window.innerHeight / 2,
                }}
                onPointerMissed={() => setActivePlane(null)}>
                <ambientLight intensity={0.4} />
                <directionalLight position={[10, 10, 10]} intensity={0.8} />
                <directionalLight position={[-10, 10, -10]} intensity={0.6} />
                <CameraControls ref={cameraControlsRef} />

                {glbSceneRef.current && (
                    <TransformControls
                        ref={transformControlsRef}
                        object={glbSceneRef.current}
                        mode="rotate" // "translate", "scale", or "rotate"
                        enabled={true} // or use transformEnabled state
                        showX={true}
                        showY={true}
                        showZ={true}
                        onMouseDown={() =>
                            (cameraControlsRef.current.enabled = false)
                        }
                        onMouseUp={() =>
                            (cameraControlsRef.current.enabled = true)
                        }
                    />
                )}
                <group ref={groupRef}>
                    <GLBModel
                        modelRef={glbSceneRef}
                        activePlane={activePlane}
                        onSelect={handleMeshSelect}
                        onModelLoaded={handleModelLoaded} // <-- this is key
                        onSceneLoaded={(scene) => {
                            const pos = scene.position.clone();
                            pos.x -= 15000; // same offset as before
                            setCubePosition(pos);
                        }}
                    />
                    <mesh
                        scale={2.5}
                        position={[
                            cubePosition.x,
                            cubePosition.y,
                            cubePosition.z,
                        ]}>
                        <boxGeometry
                            attach="geometry"
                            args={[3000, 3000, 3000]}
                            ref={boxRef}
                        />
                        <meshPhysicalMaterial attach="material" color="white" />
                    </mesh>
                </group>

                {planeSelections.plane1 && (
                    <NormalArrow
                        normal={planeSelections.plane1.normal}
                        position={planeSelections.plane1.position}
                    />
                )}
                <axesHelper args={[5000]} />
            </Canvas>
        </div>
    );
}
