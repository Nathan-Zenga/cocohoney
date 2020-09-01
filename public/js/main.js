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

    $("nav .sub-list-toggle").click(function() {
        $("nav .sub-list").stop().slideUp(300);
        $(this).next(".sub-list").stop().slideToggle(300);
    });

    $(window).on("load", function() {
        $(".image-highlight").delay(700).each(function(i) {
            $(this).delay(i * 1000).fadeIn(2000);
        })
    });

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

    try { slideInitial() } catch(e) {}
});
