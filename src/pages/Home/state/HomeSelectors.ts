import { ApplicationState } from '../../../redux/store';

export const selectRemoteMouseByID =
  (id: number) =>
  ({ home }: ApplicationState) =>
    home.byMouseID[id];

export const selectLocalMouse = ({ home }: ApplicationState) =>
  home.byMouseID[0];

export const selectAllRemoteMice = ({ home }: ApplicationState) => home.allMice;
