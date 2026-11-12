using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Text.Json;
using CommunityToolkit.Mvvm.ComponentModel;

namespace NovaTrpgClient.Models
{
    public partial class DynamicFieldItem : ObservableObject
    {
        [ObservableProperty]
        private string _key = "";

        [ObservableProperty]
        private string _label = "";

        [ObservableProperty]
        private string _value = "";

        [ObservableProperty]
        private bool _isEditable = true;

        [ObservableProperty]
        private bool _isMultiline;
    }

    public partial class DynamicCustomBlock : ObservableObject
    {
        [ObservableProperty]
        private string _key = "";

        [ObservableProperty]
        private string _title = "";

        [ObservableProperty]
        private string _headerColor = "#F59E0B"; // Янтарний/Золотий за замовчуванням

        [ObservableProperty]
        private string _icon = "🌐";

        public ObservableCollection<DynamicFieldItem> Fields { get; } = new();
        public ObservableCollection<string> Tags { get; } = new();
        public ObservableCollection<AbilityInfo> Items { get; } = new();

        public bool HasFields => Fields.Count > 0;
        public bool HasTags => Tags.Count > 0;
        public bool HasItems => Items.Count > 0;
    }

    public static class DynamicSheetHelper
    {
        private static readonly Dictionary<string, (string Title, string Color, string Icon)> KnownBlockStyles =
            new(StringComparer.OrdinalIgnoreCase)
            {
                { "reputation", ("ФРАКЦІЇ ТА РЕПУТАЦІЯ", "#F59E0B", "🏛️") },
                { "magic_schools", ("МАГІЧНІ ШКОЛИ", "#C084FC", "🔮") },
                { "afflictions", ("ПРОКЛЯТТЯ ТА ХВОРОБИ", "#EF4444", "☠️") },
                { "blessings", ("БЛАГОСЛОВЕННЯ ТА АУРИ", "#34D399", "✨") },
                { "status_effects", ("СТАТУСИ ТА ЕФЕКТИ", "#38BDF8", "⚡") },
                { "lore", ("ЗНАННЯ СВІТУ ТА ТАЄМНИЦІ", "#A78BFA", "📜") },
                { "titles_and_ranks", ("ТИТУЛИ ТА ЗВАННЯ", "#FBBF24", "👑") }
            };

        public static List<DynamicCustomBlock> ParseCustomBlocks(
            Dictionary<string, JsonElement>? customBlocks,
            Dictionary<string, JsonElement>? extraProps = null)
        {
            var result = new List<DynamicCustomBlock>();

            void ProcessEntry(string key, JsonElement val)
            {
                if (string.IsNullOrWhiteSpace(key)) return;

                // Ігноруємо службові мітки часу
                if (key.Equals("created_at", StringComparison.OrdinalIgnoreCase) ||
                    key.Equals("updated_at", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                var block = new DynamicCustomBlock
                {
                    Key = key
                };

                if (KnownBlockStyles.TryGetValue(key, out var style))
                {
                    block.Title = style.Title;
                    block.HeaderColor = style.Color;
                    block.Icon = style.Icon;
                }
                else
                {
                    block.Title = FormatTitle(key);
                    block.HeaderColor = "#E5E7EB";
                    block.Icon = "🌐";
                }

                switch (val.ValueKind)
                {
                    case JsonValueKind.Object:
                        foreach (var prop in val.EnumerateObject())
                        {
                            block.Fields.Add(new DynamicFieldItem
                            {
                                Key = prop.Name,
                                Label = FormatTitle(prop.Name),
                                Value = prop.Value.ToString(),
                                IsEditable = true,
                                IsMultiline = prop.Value.ToString().Length > 50
                            });
                        }
                        break;

                    case JsonValueKind.Array:
                        foreach (var item in val.EnumerateArray())
                        {
                            if (item.ValueKind == JsonValueKind.String)
                            {
                                var str = item.GetString();
                                if (!string.IsNullOrWhiteSpace(str))
                                {
                                    block.Tags.Add(str);
                                }
                            }
                            else if (item.ValueKind == JsonValueKind.Object)
                            {
                                string name = "";
                                string desc = "";
                                if (item.TryGetProperty("name", out var np)) name = np.GetString() ?? "";
                                if (item.TryGetProperty("desc", out var dp)) desc = dp.GetString() ?? "";
                                if (string.IsNullOrEmpty(name) && item.TryGetProperty("title", out var tp)) name = tp.GetString() ?? "";
                                if (string.IsNullOrEmpty(desc) && item.TryGetProperty("description", out var des)) desc = des.GetString() ?? "";

                                if (!string.IsNullOrWhiteSpace(name))
                                {
                                    block.Items.Add(new AbilityInfo { Name = name, Desc = desc });
                                }
                            }
                        }
                        break;

                    case JsonValueKind.String:
                        block.Fields.Add(new DynamicFieldItem
                        {
                            Key = key,
                            Label = FormatTitle(key),
                            Value = val.GetString() ?? "",
                            IsEditable = true,
                            IsMultiline = true
                        });
                        break;

                    default:
                        block.Fields.Add(new DynamicFieldItem
                        {
                            Key = key,
                            Label = FormatTitle(key),
                            Value = val.ToString(),
                            IsEditable = true
                        });
                        break;
                }

                if (block.HasFields || block.HasTags || block.HasItems)
                {
                    result.Add(block);
                }
            }

            if (customBlocks != null)
            {
                foreach (var kvp in customBlocks)
                {
                    ProcessEntry(kvp.Key, kvp.Value);
                }
            }

            if (extraProps != null)
            {
                foreach (var kvp in extraProps)
                {
                    // Пропускаємо вже відомі кореневі ключі
                    if (kvp.Key.Equals("meta", StringComparison.OrdinalIgnoreCase) ||
                        kvp.Key.Equals("anatomy_and_health", StringComparison.OrdinalIgnoreCase) ||
                        kvp.Key.Equals("storage_and_equipment", StringComparison.OrdinalIgnoreCase) ||
                        kvp.Key.Equals("abilities", StringComparison.OrdinalIgnoreCase) ||
                        kvp.Key.Equals("custom_blocks", StringComparison.OrdinalIgnoreCase) ||
                        kvp.Key.Equals("created_at", StringComparison.OrdinalIgnoreCase) ||
                        kvp.Key.Equals("updated_at", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    ProcessEntry(kvp.Key, kvp.Value);
                }
            }

            return result;
        }

        private static string FormatTitle(string key)
        {
            var cleaned = key.Replace('_', ' ').Trim();
            if (string.IsNullOrEmpty(cleaned)) return "";
            return char.ToUpperInvariant(cleaned[0]) + cleaned.Substring(1);
        }
    }
}
