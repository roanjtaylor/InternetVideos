(defpackage #:internet-vids
  (:use #:cl)
  (:local-nicknames (#:jzon #:com.inuoe.jzon)
                    (#:ht #:hunchentoot)
                    (#:bt #:bordeaux-threads))
  (:export #:start #:stop #:authorize #:main))
