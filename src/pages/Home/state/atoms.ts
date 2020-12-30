import { ColorResult } from 'react-color';
import createAtom from '../../../utils/createAtom';

export enum AtomTypes {
  HOME_COLOR_STATE = 'HOME_COLOR_STATE',
}

export const useColorState = createAtom<ColorResult>({
  key: AtomTypes.HOME_COLOR_STATE,
  default: { hex: '#fff' } as ColorResult,
});
