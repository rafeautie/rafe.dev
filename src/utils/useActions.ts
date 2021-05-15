import { ActionCreatorsMapObject, bindActionCreators } from 'redux';
import { useDispatch } from 'react-redux';
import { useMemo } from 'react';

const useActions = <A extends ActionCreatorsMapObject, D extends Array<any>>(
  actions: A,
  deps: D,
) => {
  const dispatch = useDispatch();
  return useMemo(
    () => bindActionCreators(actions, dispatch),
    deps ? [dispatch, ...deps] : [dispatch],
  );
};

export default useActions;
