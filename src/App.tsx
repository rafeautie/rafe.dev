import './styles/App.module.css';
import React, { lazy } from 'react';
import { Switch, Route } from 'react-router-dom';
import { RecoilRoot } from 'recoil';

const Home = lazy(() => import('./pages/Home'));
const Garage = lazy(() => import('./pages/Garage'));
const GarageClassify = lazy(() => import('./pages/GarageClassify'));

function App() {
  return (
    <RecoilRoot>
      <Switch>
        <Route exact path={['/']} component={Home} />
        <Route exact path={['/garage']} component={Garage} />
        <Route exact path={['/garage-classify']} component={GarageClassify} />
      </Switch>
    </RecoilRoot>
  );
}

export default App;
