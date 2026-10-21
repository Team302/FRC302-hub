// Sets the colour theme before first paint (no flash). 'dark' (default), 'light' or 'system'.
(function () {
  var choice = 'dark'
  try { choice = localStorage.getItem('hub302.theme') || 'dark' } catch (e) { /* storage blocked */ }
  var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
})()
