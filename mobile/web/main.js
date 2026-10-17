// Wird vor der App geladen: Kanal, Ersatz für electron, window.api (aus preload.js, siehe mobile/build-web.js)
import './channel.js';
import { connect } from './electron-web.js';
import './preload-web.js';

connect();
window.api.mobile = true;
