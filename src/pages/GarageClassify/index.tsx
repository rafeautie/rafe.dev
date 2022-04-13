/* eslint-disable no-alert */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { isEmpty, isNil } from 'lodash';
import Webcam from 'react-webcam';
// @ts-ignore
import ml5 from 'ml5';
import styles from './GarageClassify.module.css';

const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: 'environment',
};

const updateGarageState = async (password: string, results: any) => {
  await fetch('/api/garage', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password, results }),
  });
};

const GarageClassify = () => {
  const [password, setPassword] = useState<string | null>(null);
  const [didLoadModel, setDidLoadModel] = useState(false);

  const objectDetector = useMemo(
    () => ml5.objectDetector('yolo', {}, () => setDidLoadModel(true)),
    [],
  );

  useEffect(() => {
    if (isNil(password) || isEmpty(password)) {
      setPassword(prompt('Enter password:'));
    }
  }, []);

  const webcamRef = useRef<Webcam | null>(null);

  const classify = useCallback(() => {
    if (isNil(password)) {
      return;
    }

    const imageSrc = webcamRef.current?.getScreenshot();
    const img = document.createElement('img');

    if (isNil(imageSrc)) {
      return;
    }

    img.src = imageSrc;
    img.width = videoConstraints.width;
    img.height = videoConstraints.height;

    objectDetector.detect(img, (error: string, results: any) => {
      img.remove();
      if (isNil(error)) {
        updateGarageState(password, results);
      }
    });
  }, [password, objectDetector, webcamRef]);

  useEffect(() => {
    if (!didLoadModel) {
      return;
    }

    setTimeout(classify, 1000);

    const intervalID = setInterval(classify, 1000 * 60 * 3);

    // eslint-disable-next-line consistent-return
    return () => clearInterval(intervalID);
  }, [password, didLoadModel]);

  return (
    <div className={styles.container}>
      {!(isNil(password) || isEmpty(password)) && didLoadModel && (
        <>
          <Webcam
            audio={false}
            height={window.innerHeight - 125}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width={window.innerWidth}
            videoConstraints={videoConstraints}
          />

          <button
            className={styles.prettyButton}
            type="button"
            onClick={classify}
          >
            Classify
          </button>
        </>
      )}
    </div>
  );
};

export default GarageClassify;
