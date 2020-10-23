$(function() {
    window.submitBtnController = function(form, progressMsg) {
        var $submitBtn = this.submitBtn = $(form).find(":submit").attr("disabled", true);
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

    $("#nav-toggle").click(function() { $("nav").fadeIn() });

    $("#nav-close-icon").click(function() { $("nav").fadeOut() });

    $("nav .sub-list-toggle").click(function() {
        $("nav .sub-list").stop().slideUp(300);
        $(this).next(".sub-list").stop().slideToggle(300);
    });

    $(".quantity-control-btn").click(function() {
        $(this).parent(".quantity-wrapper").find("input[type=number]").get(0).stepUp($(this).data("step"));
    });

    $(".add-to-cart").submit(function(e) {
        e.preventDefault();
        var btnControl = new submitBtnController(this, ".");
        $.post(this.action, $(this).serializeArray(), function(item_count) {
            var $btn = $("#cart-icon").toggleClass("visible", item_count > 0);
            $("#cart-item-count").text(item_count);
            $btn.clone(true).insertAfter($btn).animate({ fontSize: "+=3em", opacity: "0" }, function() { $(this).remove() });
        }).fail(function(err) {
            alert(err.responseText);
        }).always(function() {
            btnControl.finish();
        })
    });

    $(window).on("load", function() {
        $(".image-highlight").delay(700).each(function(i) {
            $(this).delay(i * 1000).fadeIn(2000);
        })
    });

    $(window).on("load hashchange", function() {
        if (location.hash) {
            $(".section-dropdown-options select").prop("value", location.hash).trigger("change");
        }
    });

    $(".section-dropdown-options select").change(function() {
        $(".nav-pills a[href='"+ this.value +"']").get(0).click()
    });

    window.readDataURLs = function(files, cb) {
        $.each(files, function(i, file) {
            var reader = new FileReader();
            reader.onload = cb;
            reader.readAsDataURL(file)
        });
    };

    $(".clear-uploads").click(function(e) {
        e.preventDefault();
        $("#"+this.dataset.id).val("").change();
    });

    $(".file-upload-container :file").change(function() {
        var files = this.files;
        var field = this.dataset.fieldname;
        var $container = $(this).closest(".file-upload-container");
        var $image_url = $container.find("input[type=url]").attr("disabled", false).val("");
        $container.find("input:hidden").remove();
        if (files && files.length) {
            var $submitInput = $(this).closest("form").find(":submit").attr("disabled", true);
            readDataURLs(files, function(e) {
                $("<input type='hidden' name='"+ field +"'>").val(e.target.result).appendTo($container);
                $image_url.attr("disabled", true).val(files.length > 1 ? files.length+" files selected" : files[0].name);
                $submitInput.attr("disabled", false);
            });
        }
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
            if (noBullets) {
                return;
            }
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
            if (noArrows) {
                return;
            }
            var leftArrow = document.createElement('a')
            var iLeft = document.createElement('i');
            iLeft.classList.add('fal')
            iLeft.classList.add('fa-angle-left')
            leftArrow.classList.add('slider-nav', 'slider-left')
            leftArrow.appendChild(iLeft)
            leftArrow.addEventListener('click', () => {
                slideLeft();
            })
            var rightArrow = document.createElement('a')
            var iRight = document.createElement('i');
            iRight.classList.add('fal')
            iRight.classList.add('fa-angle-right')
            rightArrow.classList.add('slider-nav', 'slider-right')
            rightArrow.appendChild(iRight)
            rightArrow.addEventListener('click', () => {
                slideRight();
            })
            container.appendChild(leftArrow);
            container.appendChild(rightArrow);
        }
    
        function slideInitial() {
            initBullets();
            initArrows();
            setTimeout(function() {
                slideRight();
            }, 500);
        }
    
        function updateBullet() {
            if (!noBullets) {
                document.querySelector('.bullet-container').querySelectorAll('.bullet').forEach((elem, i) => {
                    elem.classList.remove('active');
                    if (i === slideCurrent) {
                        elem.classList.add('active');
                    }
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
            while (slideCurrent !== index) {
                sliding();
            }
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
