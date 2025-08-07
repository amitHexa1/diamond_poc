import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

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
                    child.material.color = new THREE.Color(0xffffff);
                }
                meshRefs.current.push(child);
            }
        });

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

        const centroid = new THREE.Vector3()
            .addVectors(a, b)
            .add(c)
            .divideScalar(3)
            .applyMatrix4(mesh.matrixWorld);

        removeHelper(activePlane);

        // const arrowHelper = new THREE.ArrowHelper(
        //     worldNormal,
        //     centroid,
        //     5000,
        //     activePlane === 'plane1' ? 0xff0000 : 0x0000ff, // different color for each plane if you want
        // );

        // helperRefs.current[activePlane] = arrowHelper;
        // scene.add(arrowHelper);

        // Pass both name, normal, and centroid
        onSelect?.(activePlane, mesh.name, worldNormal, centroid);
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
    const [perpendicular, setPerpendicular] = useState(null); // { normal, position }
    const [clonedScene, setClonedScene] = useState(null);
    const clonedSceneRef = useRef();
    const glbSceneRef = useRef();
    const perpendicularArrowRef = useRef();
    const cameraControlsRef = useRef();

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

    useEffect(() => {
        setTimeout(() => {
            handleFitToView();
        }, 500);
    }, []);

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

        const from = center.clone().add(new THREE.Vector3(0, 0, distance));
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
            const n1 = plane1.normal.clone().normalize();
            const n2 = plane2.normal.clone().normalize();

            const perpNormal = new THREE.Vector3()
                .crossVectors(n1, n2)
                .normalize();
            const centroid1 = plane1.centroid;
            const centroid2 = plane2.centroid;

            const averagePosition = new THREE.Vector3()
                .addVectors(centroid1, centroid2)
                .multiplyScalar(0.5);

            // Update perpendicular visual plane
            setPerpendicular({
                normal: perpNormal,
                position: averagePosition,
            });

            const camera = cameraControlsRef.current?.camera;
            if (!camera) {
                console.warn('❌ Camera not found.');
                return;
            }

            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection).normalize();

            // Create rotation matrix that rotates from perpNormal to cameraDirection
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(
                perpNormal.clone().normalize(),
                cameraDirection,
            );

            const rotationMatrix =
                new THREE.Matrix4().makeRotationFromQuaternion(quaternion);

            const rotatedN1 = n1
                .clone()
                .applyMatrix4(rotationMatrix)
                .normalize();

            // // --- Step 2: Project rotatedN1 onto XY plane and compute angle from +X
            // const projected = new THREE.Vector3(
            //     rotatedN1.x,
            //     rotatedN1.y,
            //     0,
            // ).normalize();
            let angle = Math.atan2(rotatedN1.x, rotatedN1.y); // Radians from +X
            angle += 0.05;

            // Convert angle to degrees if needed, or keep in radians
            // console.log("Rotated angle from +X axis (deg):", THREE.MathUtils.radToDeg(angle));

            // --- Step 3: Create Z-axis rotation matrix
            const zAxisRotationMatrix = new THREE.Matrix4().makeRotationZ(
                -angle,
            ); // Negative to rotate back to align with X

            // Apply rotation matrix to xond mesh
            if (clonedSceneRef.current) {
                clonedSceneRef.current.applyMatrix4(rotationMatrix);
                // clonedSceneRef.current.applyMatrix4(zAxisRotationMatrix);

                // Reposition it at the average position
                clonedSceneRef.current.position.copy(averagePosition);
                clonedSceneRef.current.position.x += 15000; // Adjust height if needed
            } else {
                console.warn('❌ clonedSceneRef not available');
            }
        }
    };

    const handleFitToView = () => {
        const clonedScene = clonedSceneRef.current;
        const glbScene = glbSceneRef.current; // We'll set this up below

        if (!clonedScene && !glbScene) {
            console.warn('❌ No model found to fit.');
            return;
        }

        const combinedBox = new THREE.Box3();

        if (clonedScene) {
            combinedBox.expandByObject(clonedScene);
        }

        if (glbScene) {
            combinedBox.expandByObject(glbScene);
        }

        const size = new THREE.Vector3();
        combinedBox.getSize(size);
        const center = new THREE.Vector3();
        combinedBox.getCenter(center);

        const distance = Math.max(size.x, size.y, size.z) * 1.5;

        const from = center.clone().add(new THREE.Vector3(0, 0, distance));
        const to = center;

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
                <GLBModel
                    modelRef={glbSceneRef}
                    activePlane={activePlane}
                    onSelect={handleMeshSelect}
                    onModelLoaded={handleModelLoaded} // <-- this is key
                    onSceneLoaded={(scene) => {
                        // Clone it and store
                        const clone = scene.clone(true);
                        clone.traverse((child) => {
                            if (child.isMesh) {
                                child.material = child.material.clone();
                            }
                        });
                        clone.position.x += 15000; // 👈 shift to the right
                        setClonedScene(clone);
                    }}
                />
                {clonedScene && (
                    <primitive ref={clonedSceneRef} object={clonedScene} />
                )}

                {perpendicular && (
                    <>
                        {/* <PerpendicularPlane
                            normal={perpendicular.normal}
                            position={perpendicular.position}
                        /> */}
                        {/* <NormalArrow
                            normal={perpendicular.normal}
                            position={perpendicular.position}
                            length={3000}
                            color={0x00ff00}
                        /> */}
                    </>
                )}
                <axesHelper args={[5000]} />
            </Canvas>
        </div>
    );
}
