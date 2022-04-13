import './styles/App.module.css';
import React from 'react';
import { Switch, Route } from 'react-router-dom';
import { RecoilRoot } from 'recoil';

import Home from './pages/Home';

function App() {
  return (
    <RecoilRoot>
      <Switch>
        <Route exact path={['/', '*']} component={Home} />
      </Switch>
    </RecoilRoot>
  );
}

export default App;
