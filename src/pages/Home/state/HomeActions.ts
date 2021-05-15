import { createAction } from '@reduxjs/toolkit';
import { TypeofActions } from '../../../typings/UtilTypes';
import { RemoteMouseState } from '../typings';

export enum HomeActionTypes {
  CREATE_MOUSE = 'CREATE_MOUSE',
  UPDATE_MOUSE = 'UPDATE_MOUSE',
  DELETE_MOUSE = 'DELETE_MOUSE',
}

export const HomeActions = {
  createMouse: createAction<
    {
      id: number;
      mouse: RemoteMouseState;
    },
    HomeActionTypes.CREATE_MOUSE
  >(HomeActionTypes.CREATE_MOUSE),
  updateMouse: createAction<
    {
      id: number;
      mouse: Partial<RemoteMouseState>;
    },
    HomeActionTypes.UPDATE_MOUSE
  >(HomeActionTypes.UPDATE_MOUSE),
  deleteMouse: createAction<{ id: number }, HomeActionTypes.DELETE_MOUSE>(
    HomeActionTypes.DELETE_MOUSE,
  ),
};

export type HomeActions = TypeofActions<typeof HomeActions>;
