import gsap from 'gsap';
import * as THREE from 'three';

export class Utils {
    static angleToEqualize(p1, p2, axis) {
        let dx, dy;

        switch (axis) {
            case 'x': // Rotate around X-axis → use YZ plane
                dx = p1.y - p2.y; // horizontal in YZ view
                dy = p2.z - p1.z; // vertical in YZ view
                break;

            case 'y': // Rotate around Y-axis → use XZ plane
                dx = p1.x - p2.x; // horizontal in XZ view
                dy = p2.z - p1.z; // vertical in XZ view
                break;

            case 'z': // Rotate around Z-axis → use XY plane
                dx = p1.y - p2.y; // vertical in XY view
                dy = p1.x - p2.x; // horizontal in XY view
                break;

            default:
                throw new Error("Axis must be 'x', 'y', or 'z'");
        }

        return Math.atan2(dy, dx); // radians
    }
    static animateRotation(object, angle, axis, callback = null) {
        const obj = {};
        if (axis === 'x') {
            obj.x = angle;
        } else if (axis === 'y') {
            obj.y = angle;
        } else if (axis === 'z') {
            obj.z = angle;
        }
        gsap.to(object.rotation, {
            ...obj,
            duration: 1,
            ease: 'power2.inOut',
        });
        if (!callback) return;
        callback();
    }
    static angleToEqualizeZ(p1, p2) {
        // p1 and p2 are THREE.Vector3
        const y1 = p1.y,
            z1 = p1.z;
        const y2 = p2.y,
            z2 = p2.z;
        return Math.atan2(z2 - z1, y1 - y2); // radians
    }
    static angleZToEqualizeX(p1, p2) {
        // p1 and p2 are THREE.Vector3
        const x1 = p1.x,
            y1 = p1.y;
        const x2 = p2.x,
            y2 = p2.y;
        return Math.atan2(x1 - x2, y1 - y2); // radians
    }
    static getPlanesIntersectionLine(plane1, plane2) {
        // Direction of the intersection line
        const direction = new THREE.Vector3().crossVectors(
            plane1.normal,
            plane2.normal,
        );

        if (direction.lengthSq() === 0) {
            // Parallel or coincident planes
            return null;
        }

        const n1 = plane1.normal;
        const n2 = plane2.normal;
        const c1 = -plane1.constant;
        const c2 = -plane2.constant;

        const n1xn2 = new THREE.Vector3().crossVectors(n1, n2);
        const temp1 = new THREE.Vector3()
            .crossVectors(n1xn2, n2)
            .multiplyScalar(c1);
        const temp2 = new THREE.Vector3()
            .crossVectors(n1, n1xn2)
            .multiplyScalar(c2);

        const pointOnLine = new THREE.Vector3()
            .addVectors(temp1, temp2)
            .divideScalar(n1xn2.lengthSq());

        return { point: pointOnLine, direction: direction.normalize() };
    }
    static getMeshIntersectionWithLine(mesh, linePoint, lineDir) {
        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.copy(linePoint);
        raycaster.ray.direction.copy(lineDir).normalize();
        const intersections = raycaster.intersectObject(mesh, true);
        console.log(intersections);
        return intersections.length > 0 ? intersections : null;
    }
}
