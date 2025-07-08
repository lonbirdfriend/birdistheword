// Authentication middleware

const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            // API request
            return res.status(401).json({ 
                error: 'Authentication required',
                redirect: '/auth/login' 
            });
        } else {
            // Regular request
            return res.redirect('/auth/login');
        }
    }
};

const requireGuest = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    } else {
        return next();
    }
};

const optionalAuth = (req, res, next) => {
    // Continue regardless of authentication status
    next();
};

module.exports = {
    requireAuth,
    requireGuest,
    optionalAuth
};