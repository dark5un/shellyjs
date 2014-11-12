global.CDEF("MODULE_CACHE", false);

global.CDEF("CLUSTER_NUM_SOCKET", 1);

global.CDEF("EMAIL_NOSEND", false);
global.CDEF("EMAIL_SENDTO", "scott@lgdales.com");

//global.CDEF("LOG_CONSOLE_OPTS", { level: "debug", colorize: true, timestamp: false });
global.CDEF("LOG_MODULES", {"shelly": 1,
  "locate": 0,
  "shcall": 0,
  "rest": 1,
  "send": 0,
  "notify": 0,
  "shmatcher": 0,
  "recv": 0,
  "SWD": 1});

//global.CDEF("DB_WRAPPER", global.C.BASE_DIR + "/lib/db/shredis.js");
//global.CDEF("DB_OPTIONS", {port: 6379, host: "127.0.0.1"});
