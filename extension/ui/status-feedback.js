/** A short visual receipt in the existing header; live announcements stay in app. */
export function createStatusFeedback(root) {
  let host, fallback = '', message = '', timer;
  function update() {
    if (!host?.isConnected) return;
    host.textContent = message || fallback;
    host.classList.toggle('has-feedback', Boolean(message));
    host.title = message;
  }
  function clear() {
    clearTimeout(timer);
    message = '';
    update();
  }
  return {
    bind() {
      host = root.querySelector('.connection-label');
      fallback = host?.textContent || '';
      if (host?.classList.contains('has-error')) clear();
      else update();
    },
    show(text) {
      if (host?.classList.contains('has-error')) return;
      clearTimeout(timer);
      message = text;
      update();
      timer = setTimeout(clear, 4000);
    },
    clear,
  };
}
