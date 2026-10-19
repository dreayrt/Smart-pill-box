#pragma once

#include <map>
#include <string>
#include <vector>

namespace FakeFirebase {
struct Write {
    std::string method;
    std::string path;
    std::string payload;
};

inline std::map<std::string, std::string> documents;
inline std::vector<Write> writes;

inline void clear() {
    documents.clear();
    writes.clear();
}
inline void set(const std::string& path, const std::string& json) { documents[path] = json; }
inline std::string get(const std::string& path) {
    const auto found = documents.find(path);
    return found == documents.end() ? "null" : found->second;
}
inline void record(const char* method, const std::string& path, const std::string& payload = {}) {
    writes.push_back({method, path, payload});
    if (std::string(method) == "DELETE") documents.erase(path);
    else documents[path] = payload;
}
inline bool wrote(const std::string& method, const std::string& path) {
    for (const auto& item : writes) {
        if (item.method == method && item.path == path) return true;
    }
    return false;
}
inline const Write* lastWrite(const std::string& method, const std::string& path) {
    for (auto it = writes.rbegin(); it != writes.rend(); ++it) {
        if (it->method == method && it->path == path) return &*it;
    }
    return nullptr;
}
}
