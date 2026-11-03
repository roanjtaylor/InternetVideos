(in-package #:internet-vids)

(defparameter *scope* "https://www.googleapis.com/auth/youtube.readonly")
(defparameter *token-url* "https://oauth2.googleapis.com/token")
(defparameter *auth-url* "https://accounts.google.com/o/oauth2/v2/auth")

(defun redirect-uri ()
  (format nil "http://localhost:~A/oauth/callback" (cfg "port" 8788)))

(defun consent-url ()
  "URL the user opens once in a real browser to grant read access."
  (quri:render-uri
   (quri:make-uri :defaults *auth-url*
                  :query `(("client_id" . ,(require-cfg "client_id"))
                           ("redirect_uri" . ,(redirect-uri))
                           ("response_type" . "code")
                           ("scope" . ,*scope*)
                           ("access_type" . "offline")
                           ("prompt" . "consent")))))

(defun token-request (params)
  (jzon:parse (dex:post *token-url* :content params)))

(defun exchange-code (code)
  "Swap an authorization code for tokens; persist the refresh token."
  (let* ((resp (token-request `(("code" . ,code)
                                ("client_id" . ,(require-cfg "client_id"))
                                ("client_secret" . ,(require-cfg "client_secret"))
                                ("redirect_uri" . ,(redirect-uri))
                                ("grant_type" . "authorization_code"))))
         (refresh (jget resp "refresh_token")))
    (unless refresh
      (error "Google did not return a refresh_token: ~A" (to-json resp)))
    (setf (cfg "refresh_token") refresh)
    (save-config)
    (remember-access-token resp)
    refresh))

;;; Access-token cache -------------------------------------------------

(defvar *access-token* nil)
(defvar *access-token-expires-at* 0)
(defvar *token-lock* (bt:make-lock "token"))

(defun remember-access-token (resp)
  (setf *access-token* (jget resp "access_token")
        *access-token-expires-at* (+ (get-universal-time)
                                     (- (or (jget resp "expires_in") 3600) 60))))

(defun access-token ()
  "Return a valid access token, refreshing it when within a minute of expiry."
  (bt:with-lock-held (*token-lock*)
    (when (or (null *access-token*)
              (>= (get-universal-time) *access-token-expires-at*))
      (let ((resp (token-request
                   `(("refresh_token" . ,(require-cfg "refresh_token"))
                     ("client_id" . ,(require-cfg "client_id"))
                     ("client_secret" . ,(require-cfg "client_secret"))
                     ("grant_type" . "refresh_token")))))
        (unless (jget resp "access_token")
          (error "Token refresh failed: ~A" (to-json resp)))
        (remember-access-token resp)))
    *access-token*))
