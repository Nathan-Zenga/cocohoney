$(function() {
    window.submitBtnController = function(form, progressMsg) {
        var $submitBtn = this.submitBtn = $(form).find("input[type=submit]").attr("disabled", true);
        this.originalVal = this.submitBtn.val();
        var progressVal = this.submitBtn.val(progressMsg || "SUBMITTING").val();
        this.interval = setInterval(function() {
            var val = $submitBtn.val(), ellipsis = $submitBtn.val().includes("...");
            $submitBtn.val(ellipsis ? progressVal : val + ".");
        }, 500);
    };
    submitBtnController.prototype.finish = function() {
        clearInterval(this.interval);
        this.submitBtn.val(this.originalVal).attr("disabled", false);
    };

    $("#nav-toggle").click(function() { $("nav").fadeIn() });

    $("#nav-close-icon").click(function() { $("nav").fadeOut() });

    window.onload = function() {
        $(".image-highlight").delay(700).each(function(i) {
            $(this).delay(i * 1000).fadeIn(2000);
        })
    }
});
