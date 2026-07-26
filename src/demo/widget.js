// `root` is the widget element; the build wraps this body and guards it against
// running twice on the same node. Keep it small — this runs once per widget in
// the chat, and there can be a lot of them.
root.querySelectorAll('.item').forEach(function (item) {
  item.addEventListener('click', function () {
    item.classList.toggle('done');
  });
});
