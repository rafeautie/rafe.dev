import createAtom from '../../../utils/createAtom';
import { ColorResult } from 'react-color';

export enum AtomTypes {
  HOME_COLOR_STATE = 'HOME_COLOR_STATE',
}

export const useColorState = createAtom<ColorResult>({
  key: AtomTypes.HOME_COLOR_STATE,
  default: { hex: '#000' } as ColorResult,
});
