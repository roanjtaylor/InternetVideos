(in-package #:internet-videos)

;;; Configuration lives in backend/config.json (gitignored). Shape:
;;; {"client_id": "...", "client_secret": "...", "refresh_token": "...",
;;;  "app_key": "shared secret the phone sends", "port": 8788}

(defvar *config-path*
  (merge-pathnames "config.json"
                   (asdf:system-source-directory "internet-videos")))

(defvar *config* (make-hash-table :test 'equal))

(defun load-config ()
  (setf *config*
        (if (probe-file *config-path*)
            (jzon:parse (alexandria:read-file-into-string *config-path*))
            (make-hash-table :test 'equal)))
  *config*)

(defun save-config ()
  (with-open-file (out *config-path* :direction :output :if-exists :supersede)
    (jzon:stringify *config* :stream out :pretty t))
  (values))

(defun cfg (key &optional default)
  (multiple-value-bind (v found) (gethash key *config*)
    (if (and found (not (eq v 'null))) v default)))

(defun (setf cfg) (value key)
  (setf (gethash key *config*) value))

(defun require-cfg (key)
  (or (cfg key)
      (error "Missing ~S in ~A. See backend/README.md." key *config-path*)))
