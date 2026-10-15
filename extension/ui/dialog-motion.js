import {createUIMotion} from './motion.js';

let effects;
const prepared = new WeakSet();
const motion = () => effects ||= createUIMotion();

export function closeDialog(dialog, value) {
  if (!dialog.open) return;
  motion().exit(dialog, {backdrop:true});
  // Native close, focus restoration and submit gestures do not wait for a visual.
  dialog.close(value);
}

export function openDialog(dialog) {
  if (!prepared.has(dialog)) {
    prepared.add(dialog);
    dialog.addEventListener('cancel', event => {
      if (event.defaultPrevented || !dialog.open) return;
      event.preventDefault(); closeDialog(dialog);
    });
    dialog.addEventListener('submit', event => {
      if (event.defaultPrevented || event.target.method !== 'dialog') return;
      event.preventDefault(); closeDialog(dialog, event.submitter?.value || '');
    });
  }
  dialog.classList.add('ui-dialog-motion');
  dialog.showModal(); motion().dialog(dialog);
}
