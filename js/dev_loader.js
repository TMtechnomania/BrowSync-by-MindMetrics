// Dev loader: externalized to comply with CSP (no inline scripts in HTML)
// This checks localStorage.devInspect and loads /js/data_inspector.js when enabled.
(function(){
    try{
        if (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('devInspect') === 'true'){
            var s = document.createElement('script');
            s.src = '/js/data_inspector.js';
            s.defer = true;
            document.head.appendChild(s);
        }
    }catch(e){
        // swallow errors in production
    }
})();
