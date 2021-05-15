import { createAction, PayloadActionCreator } from '@reduxjs/toolkit';

type ExtractAction<A> = A extends PayloadActionCreator<infer P, infer T>
  ? { payload: P; type: T }
  : never;

export type TypeofActions<
  A extends Record<string, ReturnType<typeof createAction>>,
> = ExtractAction<A[keyof A]>;
