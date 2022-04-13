import { atom } from 'recoil';
import StateKeys from './StateKeys';

const selectedColorState = atom({
  key: StateKeys.SELECTED_COLOR,
  default: '#fff',
});

export default selectedColorState;
