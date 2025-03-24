jQuery(document).ready(function() {

    jQuery('#topArrow').click(function() {      
        jQuery('body,html').animate({
            scrollTop : 0                      
        }, 500);
    });


    jQuery('a[href*="#"]').on('click', function(e) {
      e.preventDefault()

      jQuery('html, body').animate(
        {
          scrollTop: jQuery(jQuery(this).attr('href')).offset().top,
        },
        500,
        'linear'
      )
    })


 });/********document.ready*********/




jQuery(window).scroll(function() {
    var scroll = jQuery(window).scrollTop();

    if (scroll >= 100) {
        jQuery(".custom-header").addClass("scroll-cl");
        jQuery("#cookieAcceptBar").show();
        jQuery("#topArrow").show();
    } else {
        jQuery(".custom-header").removeClass("scroll-cl");
        jQuery("#topArrow").hide();
    }
});


document.getElementById("year").innerHTML = new Date().getFullYear();
