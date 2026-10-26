using System.Collections.Generic;

namespace NovaTrpgClient.Models
{
    public class ContainerGroup
    {
        public string Name { get; set; } = string.Empty;
        public List<string> Items { get; set; } = new();
    }
}
