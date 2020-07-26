import { useRecoilState, atom, AtomOptions } from 'recoil';

const createAtom = <T = any>(options: AtomOptions<T>) => {
  const myAtom = atom(options);
  return () => useRecoilState<T>(myAtom);
};

export default createAtom;
