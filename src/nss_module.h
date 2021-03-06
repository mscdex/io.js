#ifndef SRC_NSS_MODULE_H_
#define SRC_NSS_MODULE_H_

#include "env.h"
#include "env-inl.h"
#include "node.h"
#include "base-object.h"
#include "base-object-inl.h"
#include "nss_wrap.h"  // NOLINT(build/include_order)

// nss_status and gaih_addrtuple are copied here from nss.h because at least
// GLIBC<2.9 does not define gaih_addrtuple there and those two definitions are
// all that nss.h contains right now
// Possible results of lookup using a nss_* function.
enum nss_status {
  NSS_STATUS_TRYAGAIN = -2,
  NSS_STATUS_UNAVAIL,
  NSS_STATUS_NOTFOUND,
  NSS_STATUS_SUCCESS,
  NSS_STATUS_RETURN
};
// Data structure used for the 'gethostbyname4_r' function.
struct gaih_addrtuple {
  struct gaih_addrtuple *next;
  char *name;
  int family;
  uint32_t addr[4];
  uint32_t scopeid;
};

namespace node {
namespace nss_module {

typedef enum nss_status (*nss_gethostbyname4_r)
  (const char* name, struct gaih_addrtuple** pat,
  char* buffer, size_t buflen, int* errnop,
  int* h_errnop, int32_t* ttlp);

typedef enum nss_status (*nss_gethostbyname3_r)
  (const char* name, int af, struct hostent* host,
  char* buffer, size_t buflen, int* errnop,
  int* h_errnop, int32_t* ttlp, char** canonname);

typedef enum nss_status (*nss_gethostbyaddr2_r)
  (const void* addr, socklen_t len, int af,
  struct hostent* host, char* buffer, size_t buflen,
  int* errnop, int* h_errnop, int32_t* ttlp);

class NSSModule : public BaseObject {
 private:
  uv_lib_t* lib_;

 public:
  nss_gethostbyname3_r ghbn3;
  nss_gethostbyname4_r ghbn4;
  nss_gethostbyaddr2_r ghba2;

  NSSModule(Environment* env,
            v8::Local<v8::Object> req_wrap_obj,
            uv_lib_t* lib,
            nss_gethostbyname3_r ghbn_3,
            nss_gethostbyname4_r ghbn_4,
            nss_gethostbyaddr2_r ghba_2);

  ~NSSModule() override;

  // args: moduleName
  static void New(const v8::FunctionCallbackInfo<v8::Value>& args);

  // args: req, [family]
  static void QueryName(const v8::FunctionCallbackInfo<v8::Value>& args);

  // args: req
  static void QueryAddr(const v8::FunctionCallbackInfo<v8::Value>& args);

  static void Initialize(v8::Handle<v8::Object> target,
                         v8::Handle<v8::Value> unused,
                         v8::Handle<v8::Context> context);
};
}
}

#endif  // SRC_NSS_MODULE_H_
