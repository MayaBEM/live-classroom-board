import { TeacherApp } from './teacher.js';
import { startStudent } from './student.js';
import { toast } from './util.js';

const root = document.getElementById('app');
const joinMatch = () => location.pathname.match(/^\/join\/([A-Za-z0-9]{4,12})\/?$/) || location.hash.match(/^#\/join\/([A-Za-z0-9]{4,12})/);
const isJoin = () => !!joinMatch() || /^#\/join\/?$/.test(location.hash);
const mode = isJoin();

window.addEventListener('unhandledrejection', e => { console.error(e.reason); });
// moving between the student screens and the teacher screens needs a fresh start
window.addEventListener('hashchange', () => { if (isJoin() !== mode) location.reload(); else if (mode) location.reload(); });

if (mode) { const m = joinMatch(); startStudent(root, m ? m[1] : null); }
else new TeacherApp(root).init().catch(e => { console.error(e); toast('Something went wrong. Please reload the page.', 'bad'); });
