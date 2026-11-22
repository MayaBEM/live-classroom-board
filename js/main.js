import { TeacherApp } from './teacher.js';
import { startStudent, startClass, startMe } from './student.js';
import { toast } from './util.js';

const root = document.getElementById('app');
const joinMatch = () => location.pathname.match(/^\/join\/([A-Za-z0-9]{4,12})\/?$/) || location.hash.match(/^#\/join\/([A-Za-z0-9]{4,12})/);
const classMatch = () => location.hash.match(/^#\/class\/([A-Za-z0-9]{4,12})/);
const meMatch = () => location.hash.match(/^#\/me\/([A-Za-z0-9]{4,12})/);
const isJoin = () => !!joinMatch() || !!classMatch() || !!meMatch() || /^#\/join\/?$/.test(location.hash);
const mode = isJoin();

// the pages never zoom by themselves (Safari pinch gestures); lists still scroll up and down
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
window.addEventListener('unhandledrejection', e => { console.error(e.reason); });
// moving between the student screens and the teacher screens needs a fresh start
window.addEventListener('hashchange', () => { if (isJoin() !== mode) location.reload(); else if (mode) location.reload(); });

if (mode) { const c = classMatch(), m = joinMatch(), me = meMatch(); if (me) startMe(root, me[1]); else if (c) startClass(root, c[1]); else startStudent(root, m ? m[1] : null); }
else new TeacherApp(root).init().catch(e => { console.error(e); toast('Something went wrong. Please reload the page.', 'bad'); });
