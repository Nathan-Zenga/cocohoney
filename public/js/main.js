$(function() {
    window.submitBtnController = function(form, progressMsg) {
        var clicked = $(form).find("#clicked:submit").length ? "#clicked" : "";
        var $submitBtn = this.submitBtn = $(form).find(clicked+":submit").attr("disabled", true);
        var method = this.method = this.submitBtn.is(":button") ? "html" : "val";
        this.originalVal = this.submitBtn[method]();
        var progressVal = this.submitBtn[method](progressMsg || "SUBMITTING")[method]();
        this.interval = setInterval(function() {
            var val = $submitBtn[method](), ellipsis = $submitBtn[method]().includes("...");
            $submitBtn[method](ellipsis ? progressVal : val + ".");
        }, 500);
    };
    submitBtnController.prototype.finish = function() {
        clearInterval(this.interval);
        this.submitBtn[this.method](this.originalVal).attr("disabled", false);
    };

    $("#context-menu-link").click(function() { $("#link-context-menu").stop().fadeToggle(200) });

    $(window).click(function() {
        if ($("#link-context-menu:hover, #context-menu-link:hover").length) return;
        $("#link-context-menu").fadeOut()
    });

    $("#nav-icon").click(function() { $("nav").fadeIn(200) });

    $("#nav-close-icon, nav a[data-toggle=pill]").click(function() { $("nav").fadeOut(200) });

    $("nav .sub-list-toggle").click(function() {
        $("nav .sub-list").stop().slideUp(300);
        $(this).next(".sub-list").stop().slideToggle(300);
    });

    $(".quantity-control-btn").click(function() {
        $(this).parent(".quantity-wrapper").find("input[type=number]").get(0).stepUp($(this).data("step"));
    });

    $(".add-to-cart").find(":submit").click(function() {
        $(this).attr("id", "clicked");
    }).end().submit(function(e) {
        e.preventDefault();
        var formaction = $(this).find("#clicked:submit").attr("formaction");
        var btnControl = new submitBtnController(this, ".");
        var action = formaction || this.action;
        $.post(action, $(this).serializeArray(), function(item_count) {
            if (action === "/wishlist/remove") $(e.target).closest(".thumb").slideUp();
            if (action === "/wishlist/add") alert("Item now added to your wishlist");
            var $btn = $("#cart-icon").toggleClass("visible", item_count > 0);
            $("#cart-item-count").text(item_count);
            $btn.clone(true).insertAfter($btn).animate({ fontSize: "+=3em", opacity: "0" }, function() { $(this).remove() });
        }).fail(function(err) {
            alert(err.responseText);
        }).always(function() {
            $("#clicked").attr("id", "");
            btnControl.finish();
        })
    });

    $(window).on("load", function(e) {
        $(".image-highlight").delay(700).each(function(i) {
            $(this).delay(i * 1000).fadeIn(2000);
        });
    }).on("touchstart", function() {
        var $video = $("#page-bg-underlay video").get(0);
        var playing = $video.currentTime > 0 && !$video.paused && !$video.ended && $video.readyState > 2;
        if (!playing) $video.play();
    });

    $(".section-dropdown-options select").change(function() {
        if (this.value && this.value.charAt(0) !== "#") location.href = this.value;
        $(".nav-pills a[href='"+ this.value +"']").click()
    });

    $(".clear-uploads").click(function(e) {
        e.preventDefault();
        $("#"+this.dataset.id).val("").change();
    });

    $(".file-upload-container :file").change(function() {
        var files = this.files;
        var fieldname = this.dataset.fieldname;
        var $container = $(this).closest(".file-upload-container");
        var $image_url = $container.find("input[type=url]").attr("disabled", false).val("");
        var $file_label = $container.find(".custom-file-label");
        var initial_label_value = $file_label.data("initial-value") || $file_label.text();
        $file_label.data("initial-value", initial_label_value).text(initial_label_value);
        $container.find("input:hidden").remove();
        if (!files || !files.length) return;
        $file_label.text("Loading...");
        var $submitInput = $(this).closest("form").find(":submit").attr("disabled", true);
        async.each(files, function(file, cb) {
            var reader = new FileReader();
            var $input = $("<input type='hidden' name='"+ fieldname +"'>").appendTo($container);
            reader.onerror = function() { cb((files.length > 1 ? "One or more images" : "Image") + " not found/valid") };
            reader.onload = function(e) {
                var media = e.target.result.includes("image") ? new Image() : document.createElement("video");
                media.onload = function() { $input.val(e.target.result); cb() };
                media.oncanplay = media.onload;
                media.onerror = reader.onerror;
                media.src = e.target.result;
            };
            reader.readAsDataURL(file)
        }, function(err) {
            if (err) { $file_label.text(initial_label_value); return alert(err.message || err) }
            var label_text = files.length > 1 ? files.length+" files selected" : files[0].name;
            $file_label.text(label_text);
            $image_url.attr("disabled", true).val(label_text);
            $submitInput.attr("disabled", false);
        });
    });

    $("form :input").not(":button, :checkbox, :file, :radio, :submit, :button, [type=number]").first().trigger("focus");

    window.cookies = Object.fromEntries(document.cookie.split(/; */).map(function(c) {
        var index = c.indexOf("=");
        var key   = c.slice(0, index);
        var value = c.slice(index + 1);
        return [decodeURIComponent(key), decodeURIComponent(value)];
    }));

    $(window).on("load", function() {
        JSON.parse(cookies.active_tab_hrefs || "[]").forEach(function(href, i) {
            if (i == 0) $(".section-dropdown-options select:visible").val(href);
            $(".nav.nav-pills a[href='"+ href +"']").click();
        });

        $(".nav.nav-pills a").on("shown.bs.tab", function() {
            var $a = $(".nav.nav-pills:visible a.active[data-toggle=pill]");
            $a = $(".section-dropdown-options select:visible").add($a);
            $a = $("nav a.active[data-toggle=pill]").add($a);
            document.cookie = "active_tab_hrefs=" + JSON.stringify($a.map(function() { return $(this).attr("href") || $(this).val() }).get()) + "; path="+ location.pathname +";";
        });
    });

    $("img[data-target='#image-lg-modal']").click(function() {
        $("#image-lg-modal .img").css("background-image", "url(" + $(this).attr("src") + ")");
    });
});
