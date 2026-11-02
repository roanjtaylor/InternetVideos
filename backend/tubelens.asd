(asdf:defsystem "tubelens"
  :description "Distraction-free YouTube backend: subscriptions, playlists, search. No recommendations, no Shorts."
  :author "Roan"
  :license "MIT"
  :depends-on ("hunchentoot" "dexador" "com.inuoe.jzon" "quri" "alexandria" "bordeaux-threads")
  :serial t
  :components ((:module "src"
                :components ((:file "package")
                             (:file "config")
                             (:file "json")
                             (:file "oauth")
                             (:file "youtube")
                             (:file "shorts")
                             (:file "server")))))
