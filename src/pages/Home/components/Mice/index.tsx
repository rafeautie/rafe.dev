import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { isNil } from 'lodash';
import RemoteMouseManager from '../../../../utils/RemoteMouse/RemoteMouseManager';
import useRelativeMouse from '../../../../utils/useRelativeMouse';

const object = new THREE.Object3D();

const Mice = () => {
  const { invalidate } = useThree();
  const ref = useRef<THREE.InstancedMesh>();

  useEffect(() => {
    return RemoteMouseManager.connect({
      listeners: {
        onAdd: () => invalidate(),
        onUpdate: () => invalidate(),
        onRemove: () => invalidate(),
      },
    });
  }, []);

  useFrame((state) => {
    const { camera } = state;

    const mesh = ref.current;
    const mice = Array.from(RemoteMouseManager.mice);

    if (mesh == null) {
      return;
    }

    const threeColor = new THREE.Color();

    for (let i = 0; i < mice.length; i += 1) {
      const [id, remoteMouseState] = mice[i];
      const { mouse, color, window: remoteWindow } = remoteMouseState;
      const { x, y } = id === 0 ? mouse : useRelativeMouse(mouse, remoteWindow);

      const finalX = (x / window.innerWidth) * 2 - 1;
      const finalY = -(y / window.innerHeight) * 2 + 1;

      const vector = new THREE.Vector3(finalX, finalY, 0.5);

      vector.unproject(camera);

      const direction = vector.sub(camera.position).normalize();
      const distance = -camera.position.z / direction.z;
      const position = camera.position
        .clone()
        .add(direction.multiplyScalar(distance));

      object.position.set(position.x, position.y, 0);
      object.updateMatrix();

      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, threeColor.setStyle(color));
    }

    mesh.count = mice.length;
    mesh.instanceMatrix.needsUpdate = true;

    if (!isNil(mesh.instanceColor)) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 10]}>
      <circleGeometry args={[0.07, 32]} />
      <meshPhongMaterial />
    </instancedMesh>
  );
};

export default Mice;
