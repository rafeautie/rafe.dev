import { MouseType, WindowType } from '../pages/Home/typings';

const useRelativeMouse = (
  mouse: MouseType,
  remoteWindow: WindowType,
): MouseType => {
  if (!remoteWindow || !mouse) return mouse;

  const { width: rwidth, height: rheight } = remoteWindow;
  const wwidth = window.innerWidth;
  const wheight = window.innerHeight;
  const xdiff = (wwidth - rwidth) / 2;
  const ydiff = (wheight - rheight) / 2;

  return {
    x: mouse.x + xdiff,
    y: mouse.y + ydiff,
  };
};

export default useRelativeMouse;
