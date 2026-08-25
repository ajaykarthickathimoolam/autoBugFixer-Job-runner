package com.encipherhealth.codehealer.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Zoho Sprints embeds list data as {@code {name}_prop: {propName: index}}, an id list, and
 * {@code {name}JObj: {id: [value0, value1, ...]}} rather than plain objects. This reassembles
 * each id's values into a name-&gt;value map. Mirrors property_unfurler() in the open-source
 * tap-zohosprints Singer tap (github.com/AutoIDM/tap-zohosprints), which this was confirmed
 * against.
 */
public final class ZohoJObjUnfurler {

    public record UnfurledRecord(String id, Map<String, JsonNode> properties) {
    }

    private ZohoJObjUnfurler() {
    }

    public static List<UnfurledRecord> unfurl(JsonNode response, String propKey, String idsKey, String jobjKey) {
        return unfurl(response.path(propKey), response.path(idsKey), response.path(jobjKey));
    }

    /** Same reassembly, but for callers (like the item activity/audit feed) that already have the three pieces in hand. */
    public static List<UnfurledRecord> unfurl(JsonNode propNode, JsonNode idsNode, JsonNode jobjNode) {
        List<UnfurledRecord> result = new ArrayList<>();
        if (!idsNode.isArray()) {
            return result;
        }
        for (JsonNode idNode : idsNode) {
            String id = idNode.asText();
            JsonNode values = jobjNode.get(id);
            if (values == null || !values.isArray()) {
                continue;
            }
            Map<String, JsonNode> record = new LinkedHashMap<>();
            Iterator<Map.Entry<String, JsonNode>> fields = propNode.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                int index = field.getValue().asInt(-1);
                if (index >= 0 && index < values.size()) {
                    record.put(field.getKey(), values.get(index));
                }
            }
            result.add(new UnfurledRecord(id, record));
        }
        return result;
    }

    public static String textOf(Map<String, JsonNode> record, String... keys) {
        for (String key : keys) {
            JsonNode value = record.get(key);
            if (value != null && !value.isNull() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        return null;
    }
}
