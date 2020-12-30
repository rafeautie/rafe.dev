import './styles/App.module.css';
import React from 'react';
import { RecoilRoot } from 'recoil';
import { Switch, Route } from 'react-router-dom';

import Home from './pages/Home';
import Background from './components/Background';

function App() {
  return (
    <RecoilRoot>
      <Switch>
        <Route exact path="/" component={Home} />
      </Switch>
      <Background />
    </RecoilRoot>
  );
}

export default App;
