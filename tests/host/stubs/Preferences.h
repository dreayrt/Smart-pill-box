#pragma once

#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <vector>

class Preferences {
public:
    bool begin(const char* name, bool readOnly = false) {
        namespace_ = name ? name : "";
        readOnly_ = readOnly;
        return true;
    }

    size_t getBytesLength(const char* key) const {
        const auto it = values().find(compoundKey(key));
        return it == values().end() ? 0 : it->second.size();
    }

    size_t getBytes(const char* key, void* output, size_t length) const {
        const auto it = values().find(compoundKey(key));
        if (it == values().end()) return 0;
        const size_t copied = length < it->second.size() ? length : it->second.size();
        std::memcpy(output, it->second.data(), copied);
        return copied;
    }

    size_t putBytes(const char* key, const void* input, size_t length) {
        if (readOnly_) return 0;
        auto& value = values()[compoundKey(key)];
        const auto* bytes = static_cast<const uint8_t*>(input);
        value.assign(bytes, bytes + length);
        return length;
    }

    void end() {}

    static void clearAll() { values().clear(); }

private:
    std::string namespace_;
    bool readOnly_ = false;

    std::string compoundKey(const char* key) const {
        return namespace_ + "/" + (key ? key : "");
    }

    static std::map<std::string, std::vector<uint8_t>>& values() {
        static std::map<std::string, std::vector<uint8_t>> storage;
        return storage;
    }
};
