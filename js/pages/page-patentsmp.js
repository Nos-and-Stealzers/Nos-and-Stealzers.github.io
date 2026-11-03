(function () {
  "use strict";
  var btn = document.getElementById("copy-addr");
  var addr = document.getElementById("addr");
  var status = document.getElementById("copy-status");
  if (!btn || !addr) return;
  btn.addEventListener("click", function () {
    var text = addr.textContent.trim();
    var done = function (ok) {
      status.textContent = ok ? "Copied: " + text : "Copy failed. Select the address and copy it by hand.";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });
})();
