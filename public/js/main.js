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

    $("#context-menu-link").click(function() { $("#link-context-menu").stop().fadeToggle(300) });

    $(window).click(function() {
        if ($("#link-context-menu:hover, #context-menu-link:hover").length) return;
        $("#link-context-menu").fadeOut()
    });

    $("#nav-toggle").click(function() { $("nav").fadeIn() });

    $("#nav-close-icon").click(function() { $("nav").fadeOut() });

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

    $(window).on("load", function() {
        var cookies = !document.cookie ? null : document.cookie.split(/; ?/).map(function(cookie) {
            var keyvalue = cookie.split("=");
            return { [keyvalue[0]]: keyvalue[1] };
        }).reduce(function(p, c) { return {...p, ...c} });

        if (cookies) JSON.parse(cookies.active_tab_hrefs || "[]").forEach(function(href, i) {
            if (i == 0) $(".section-dropdown-options select:visible").val(href);
            $(".nav.nav-pills a[href='"+ href +"']").click();
        });

        $(".nav.nav-pills a").on("shown.bs.tab", function(e) {
            var $a = $(".nav.nav-pills:visible a.active[data-toggle='pill']");
            $a = $(".section-dropdown-options select:visible").add($a);
            document.cookie = "active_tab_hrefs=" + JSON.stringify($a.map(function() { return $(this).attr("href") || $(this).val() }).get()) + "; path="+ location.pathname +";";
        });
    });

    if ($(".slider-container").length) {
        var repeat = false;
        var noArrows = false;
        var noBullets = false;
    
        var container = document.querySelector('.slider-container');
        var slide = document.querySelectorAll('.slider-single');
        var slideTotal = slide.length - 1;
        var slideCurrent = -1;
    
        function initBullets() {
            if (noBullets) return;
            var bulletContainer = document.createElement('div');
            bulletContainer.classList.add('bullet-container');
            slide.forEach((elem, i) => {
                var bullet = document.createElement('div');
                bullet.classList.add('bullet')
                bullet.id = `bullet-index-${i}`
                bullet.addEventListener('click', () => {
                    goToIndexSlide(i);
                })
                bulletContainer.appendChild(bullet);
                elem.classList.add('proactivede');
            })
            container.appendChild(bulletContainer);
        }
    
        function initArrows() {
            if (noArrows) return;
            var leftArrow = document.createElement('a')
            var iLeft = document.createElement('i');
            iLeft.classList.add('fal')
            iLeft.classList.add('fa-angle-left')
            leftArrow.classList.add('slider-nav', 'slider-left')
            leftArrow.appendChild(iLeft)
            leftArrow.addEventListener('click', () => { slideLeft() })
            var rightArrow = document.createElement('a')
            var iRight = document.createElement('i');
            iRight.classList.add('fal')
            iRight.classList.add('fa-angle-right')
            rightArrow.classList.add('slider-nav', 'slider-right')
            rightArrow.appendChild(iRight)
            rightArrow.addEventListener('click', () => { slideRight() })
            container.appendChild(leftArrow);
            container.appendChild(rightArrow);
        }
    
        function slideInitial() {
            initBullets();
            initArrows();
            setTimeout(function() { slideRight() }, 500);
        }
    
        function updateBullet() {
            if (!noBullets) {
                document.querySelector('.bullet-container').querySelectorAll('.bullet').forEach((elem, i) => {
                    elem.classList.remove('active');
                    if (i === slideCurrent) elem.classList.add('active');
                })
            }
            checkRepeat();
        }
    
        function checkRepeat() {
            if (!repeat) {
                if (slideCurrent === slide.length - 1) {
                    slide[0].classList.add('not-visible');
                    slide[slide.length - 1].classList.remove('not-visible');
                    if (!noArrows) {
                        document.querySelector('.slider-right').classList.add('not-visible')
                        document.querySelector('.slider-left').classList.remove('not-visible')
                    }
                }
                else if (slideCurrent === 0) {
                    slide[slide.length - 1].classList.add('not-visible');
                    slide[0].classList.remove('not-visible');
                    if (!noArrows) {
                        document.querySelector('.slider-left').classList.add('not-visible')
                        document.querySelector('.slider-right').classList.remove('not-visible')
                    }
                } else {
                    slide[slide.length - 1].classList.remove('not-visible');
                    slide[0].classList.remove('not-visible');
                    if (!noArrows) {
                        document.querySelector('.slider-left').classList.remove('not-visible')
                        document.querySelector('.slider-right').classList.remove('not-visible')
                    }
                }
            }
        }
    
        function slideRight() {
            if (slideCurrent < slideTotal) {
                slideCurrent++;
            } else {
                slideCurrent = 0;
            }
    
            if (slideCurrent > 0) {
                var preactiveSlide = slide[slideCurrent - 1];
            } else {
                var preactiveSlide = slide[slideTotal];
            }
            var activeSlide = slide[slideCurrent];
            if (slideCurrent < slideTotal) {
                var proactiveSlide = slide[slideCurrent + 1];
            } else {
                var proactiveSlide = slide[0];
    
            }
    
            slide.forEach((elem) => {
                var thisSlide = elem;
                if (thisSlide.classList.contains('preactivede')) {
                    thisSlide.classList.remove('preactivede');
                    thisSlide.classList.remove('preactive');
                    thisSlide.classList.remove('active');
                    thisSlide.classList.remove('proactive');
                    thisSlide.classList.add('proactivede');
                }
                if (thisSlide.classList.contains('preactive')) {
                    thisSlide.classList.remove('preactive');
                    thisSlide.classList.remove('active');
                    thisSlide.classList.remove('proactive');
                    thisSlide.classList.remove('proactivede');
                    thisSlide.classList.add('preactivede');
                }
            });
            preactiveSlide.classList.remove('preactivede');
            preactiveSlide.classList.remove('active');
            preactiveSlide.classList.remove('proactive');
            preactiveSlide.classList.remove('proactivede');
            preactiveSlide.classList.add('preactive');
    
            activeSlide.classList.remove('preactivede');
            activeSlide.classList.remove('preactive');
            activeSlide.classList.remove('proactive');
            activeSlide.classList.remove('proactivede');
            activeSlide.classList.add('active');
    
            proactiveSlide.classList.remove('preactivede');
            proactiveSlide.classList.remove('preactive');
            proactiveSlide.classList.remove('active');
            proactiveSlide.classList.remove('proactivede');
            proactiveSlide.classList.add('proactive');
    
            updateBullet();
        }
    
        function slideLeft() {
            if (slideCurrent > 0) {
                slideCurrent--;
            } else {
                slideCurrent = slideTotal;
            }
    
            if (slideCurrent < slideTotal) {
                var proactiveSlide = slide[slideCurrent + 1];
            } else {
                var proactiveSlide = slide[0];
            }
            var activeSlide = slide[slideCurrent];
            if (slideCurrent > 0) {
                var preactiveSlide = slide[slideCurrent - 1];
            } else {
                var preactiveSlide = slide[slideTotal];
            }
            slide.forEach((elem) => {
                var thisSlide = elem;
                if (thisSlide.classList.contains('proactive')) {
                    thisSlide.classList.remove('preactivede');
                    thisSlide.classList.remove('preactive');
                    thisSlide.classList.remove('active');
                    thisSlide.classList.remove('proactive');
                    thisSlide.classList.add('proactivede');
                }
                if (thisSlide.classList.contains('proactivede')) {
                    thisSlide.classList.remove('preactive');
                    thisSlide.classList.remove('active');
                    thisSlide.classList.remove('proactive');
                    thisSlide.classList.remove('proactivede');
                    thisSlide.classList.add('preactivede');
                }
            });
    
            preactiveSlide.classList.remove('preactivede');
            preactiveSlide.classList.remove('active');
            preactiveSlide.classList.remove('proactive');
            preactiveSlide.classList.remove('proactivede');
            preactiveSlide.classList.add('preactive');
    
            activeSlide.classList.remove('preactivede');
            activeSlide.classList.remove('preactive');
            activeSlide.classList.remove('proactive');
            activeSlide.classList.remove('proactivede');
            activeSlide.classList.add('active');
    
            proactiveSlide.classList.remove('preactivede');
            proactiveSlide.classList.remove('preactive');
            proactiveSlide.classList.remove('active');
            proactiveSlide.classList.remove('proactivede');
            proactiveSlide.classList.add('proactive');
    
            updateBullet();
        }
    
        function goToIndexSlide(index) {
            var sliding = (slideCurrent > index) ? () => slideRight() : () => slideLeft();
            while (slideCurrent !== index) sliding();
        }
    
        $(document).keydown(function(e) {
            switch (e.keyCode) {
                case 37: slideLeft(); break;
                case 39: slideRight(); break;
            }
        });
    
        slideInitial();
    }
});
