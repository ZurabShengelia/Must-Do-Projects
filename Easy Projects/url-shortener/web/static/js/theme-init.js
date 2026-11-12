(function () {
  var choice = 'system';
  try { choice = localStorage.getItem('theme') || 'system'; } catch (e) { }
  if (choice !== 'light' && choice !== 'dark') choice = 'system';
  var dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = choice;
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
})();
