using CommunityToolkit.Mvvm.ComponentModel;
using System;
using System.Collections.Generic;

namespace NovaTrpgClient.Models
{
    public partial class ContainerGroup : ObservableObject
    {
        public string Name { get; set; } = string.Empty;
        public List<ItemInfo> Items { get; set; } = new();

        [ObservableProperty]
        private bool _isExpanded;

        public Action<string, bool>? OnExpandedChanged { get; set; }

        partial void OnIsExpandedChanged(bool value)
        {
            OnExpandedChanged?.Invoke(Name, value);
        }

        public string ItemsCountText => $"{Items.Count} предм.";
    }
}
