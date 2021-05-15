import { combineReducers } from 'redux';
import HomeReducer from '../pages/Home/state/HomeReducer';

export default combineReducers({ home: HomeReducer });
