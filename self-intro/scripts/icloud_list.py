"""Resolve the iCloud shared album and write a JSON list of {name, res: {key: url, size}} to argv[1]."""
import base64, json, sys, urllib.parse, urllib.request

SHORT = "0c6utK8NftJKqJq949XrqZrQQ"
ZONE = {"zoneName": "CMM-B3A90791-045D-4755-8EAA-4B27B934D6BF",
        "ownerRecordName": "_ca00676138fd250548c7e0cbd230a8f5",
        "zoneType": "REGULAR_CUSTOM_ZONE"}


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "text/plain", "Origin": "https://www.icloud.com"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


res = post("https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/public/records/resolve",
           {"shortGUIDs": [{"value": SHORT}]})
token = res["results"][0]["anonymousPublicAccess"]["token"]
q = post("https://p177-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/shared/records/query"
         "?remapEnums=true&publicAccessAuthToken=" + urllib.parse.quote(token, safe=""),
         {"query": {"recordType": "CPLAssetAndMasterByAssetDate", "filterBy": [
             {"fieldName": "direction", "comparator": "EQUALS", "fieldValue": {"type": "STRING", "value": "ASCENDING"}},
             {"fieldName": "startRank", "comparator": "EQUALS", "fieldValue": {"type": "INT64", "value": 0}}]},
          "resultsLimit": 200, "zoneID": ZONE})
out = []
for rec in q["records"]:
    if rec.get("recordType") != "CPLMaster":
        continue
    f = rec["fields"]
    name = base64.b64decode(f["filenameEnc"]["value"]).decode()
    item = {"name": name, "res": {}}
    for k, v in f.items():
        if k.startswith("res") and isinstance(v.get("value"), dict) and "downloadURL" in v["value"]:
            val = v["value"]
            item["res"][k] = {"url": val["downloadURL"].replace("${f}", urllib.parse.quote(name)),
                              "size": val.get("size")}
    out.append(item)
json.dump(out, open(sys.argv[1], "w"), indent=1)
for it in out:
    print(it["name"], {k: v["size"] for k, v in it["res"].items()})
