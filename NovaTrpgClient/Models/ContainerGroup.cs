using System.Collections.Generic;

namespace NovaTrpgClient.Models
{
    public class ContainerGroup
    {
        public string Name { get; set; } = string.Empty;
        public List<ItemInfo> Items { get; set; } = new();
    }
}
