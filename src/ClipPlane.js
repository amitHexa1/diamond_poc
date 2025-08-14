import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export class ClipPlane {
    static getIntersectionContour(mesh, plane) {
        if (!mesh.geometry.boundsTree) {
            // Build BVH if not already built
            mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, {
                maxLeafTris: 3,
            });
        }

        const inverseMatrix = new THREE.Matrix4();
        const localPlane = new THREE.Plane();
        const contourSegments = [];

        // Transform plane into mesh local space
        inverseMatrix.copy(mesh.matrixWorld).invert();
        localPlane.copy(plane).applyMatrix4(inverseMatrix);

        const tempLine = new THREE.Line3();
        const tempPoint = new THREE.Vector3();
        const points = [];

        mesh.geometry.boundsTree.shapecast({
            intersectsBounds: (box) => {
                // Bounding box is in local space
                return localPlane.intersectsBox(box);
            },
            intersectsTriangle: (tri) => {
                points.length = 0; // clear for this triangle

                const edges = [
                    [tri.a, tri.b],
                    [tri.b, tri.c],
                    [tri.c, tri.a],
                ];

                for (let i = 0; i < edges.length; i++) {
                    const [start, end] = edges[i];
                    tempLine.start.copy(start);
                    tempLine.end.copy(end);

                    if (localPlane.intersectLine(tempLine, tempPoint)) {
                        points.push(tempPoint.clone());
                    }
                }

                // If all 3 vertices intersect, deduplicate
                if (points.length === 3) {
                    if (points[0].distanceTo(points[1]) < 1e-5)
                        points.splice(1, 1);
                    else if (points[1].distanceTo(points[2]) < 1e-5)
                        points.splice(2, 1);
                    else points.splice(0, 1);
                }

                // Store as segment in world space
                if (points.length === 2) {
                    contourSegments.push({
                        start: points[0].clone().applyMatrix4(mesh.matrixWorld),
                        end: points[1].clone().applyMatrix4(mesh.matrixWorld),
                    });
                }
            },
        });
        const stichedContour = ClipPlane.stitchSegments(contourSegments);
        return stichedContour[0];
    }
    static getContourPlaneIntersection(contourPoints, secondPlane) {
        const intersections = [];
        const line = new THREE.Line3();
        const tempPoint = new THREE.Vector3();

        for (let i = 0; i < contourPoints.length - 1; i++) {
            const start = contourPoints[i];
            const end = contourPoints[i + 1];

            const distStart = secondPlane.distanceToPoint(start);
            const distEnd = secondPlane.distanceToPoint(end);

            if (
                (distStart >= 0 && distEnd <= 0) ||
                (distStart <= 0 && distEnd >= 0)
            ) {
                line.set(start, end);
                if (secondPlane.intersectLine(line, tempPoint)) {
                    intersections.push(tempPoint.clone());
                }
            }
        }
        return intersections;
    }
    static stitchSegments(segments, tolerance = 1e-6) {
        const stitched = [];
        const used = new Array(segments.length).fill(false);

        // Helper: check if two points are the same (within tolerance)
        function samePoint(a, b) {
            return a.distanceTo(b) < tolerance;
        }

        // Start from first unused segment
        for (let i = 0; i < segments.length; i++) {
            if (used[i]) continue;

            let polyline = [segments[i].start.clone(), segments[i].end.clone()];
            used[i] = true;

            let extended = true;
            while (extended) {
                extended = false;
                for (let j = 0; j < segments.length; j++) {
                    if (used[j]) continue;

                    // Try to connect at the end
                    if (
                        samePoint(
                            polyline[polyline.length - 1],
                            segments[j].start,
                        )
                    ) {
                        polyline.push(segments[j].end.clone());
                        used[j] = true;
                        extended = true;
                    } else if (
                        samePoint(
                            polyline[polyline.length - 1],
                            segments[j].end,
                        )
                    ) {
                        polyline.push(segments[j].start.clone());
                        used[j] = true;
                        extended = true;
                    }
                    // Try to connect at the start
                    else if (samePoint(polyline[0], segments[j].end)) {
                        polyline.unshift(segments[j].start.clone());
                        used[j] = true;
                        extended = true;
                    } else if (samePoint(polyline[0], segments[j].start)) {
                        polyline.unshift(segments[j].end.clone());
                        used[j] = true;
                        extended = true;
                    }
                }
            }
            stitched.push(polyline);
        }
        return stitched;
    }
}
