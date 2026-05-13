// Mobile companion — 2 key screens shown side by side in iOS frames

function MobileShowcase({ onClose }) {
  return (
    <div className="mobile-stage">
      <div className="mobile-stage-head">
        <div>
          <div className="eyebrow">Stirps no celular</div>
          <h2>Companion mobile</h2>
          <p className="mobile-sub">Mesma família, sempre no bolso. Adicione pessoas e fotos onde estiver.</p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}><Icon name="x" size={14}/>Voltar</button>
      </div>
      <div className="mobile-row">
        <div className="mobile-frame-wrap">
          <IOSFrame time="9:41" battery={82}>
            <MobileTreeScreen/>
          </IOSFrame>
          <div className="mobile-cap">Árvore — vista compacta</div>
        </div>
        <div className="mobile-frame-wrap">
          <IOSFrame time="9:41" battery={82}>
            <MobileProfileScreen/>
          </IOSFrame>
          <div className="mobile-cap">Perfil — Giuseppe</div>
        </div>
      </div>
    </div>
  );
}

function MobileTreeScreen() {
  const F = window.FAMILY;
  const featured = ["p_giuseppe","p_assunta","p_antonio","p_isabel","p_ricardo","p_clarice","p_helena","p_diego","p_lorenzo","p_alice"];
  return (
    <div className="m-screen">
      <div className="m-topbar">
        <div className="m-back"><Icon name="chev-left" size={16}/></div>
        <div className="m-title">Árvore</div>
        <div className="m-back"><Icon name="more" size={16}/></div>
      </div>
      <div className="m-pills">
        <span className="m-pill m-pill-on">Toda família</span>
        <span className="m-pill">Paterna</span>
        <span className="m-pill">Materna</span>
      </div>
      <div className="m-tree">
        <div className="m-tree-gen m-gen-1">
          <div className="m-leaf m-leaf-male">
            <div className="m-leaf-av" style={{background:"#c2d4dc",color:"#1f3e4d"}}>GB</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Giuseppe</div><div className="m-leaf-y">1881–1958</div></div>
          </div>
          <div className="m-amp">&</div>
          <div className="m-leaf m-leaf-female">
            <div className="m-leaf-av" style={{background:"#f0d4c8",color:"#8a3f2a"}}>AL</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Assunta</div><div className="m-leaf-y">1885–1971</div></div>
          </div>
        </div>
        <div className="m-line"/>
        <div className="m-tree-gen m-gen-2">
          <div className="m-leaf m-leaf-male">
            <div className="m-leaf-av" style={{background:"#c2d4dc",color:"#1f3e4d"}}>AB</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Antônio</div><div className="m-leaf-y">1912–1989</div></div>
          </div>
          <div className="m-amp">&</div>
          <div className="m-leaf m-leaf-female">
            <div className="m-leaf-av" style={{background:"#f0d4c8",color:"#8a3f2a"}}>IA</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Isabel</div><div className="m-leaf-y">1918–2003</div></div>
          </div>
        </div>
        <div className="m-line"/>
        <div className="m-tree-gen m-gen-3">
          <div className="m-leaf m-leaf-male">
            <div className="m-leaf-av" style={{background:"#c2d4dc",color:"#1f3e4d"}}>RB</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Ricardo</div><div className="m-leaf-y">1948 –</div></div>
          </div>
          <div className="m-amp">&</div>
          <div className="m-leaf m-leaf-female">
            <div className="m-leaf-av" style={{background:"#f0d4c8",color:"#8a3f2a"}}>CM</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Clarice</div><div className="m-leaf-y">1951 –</div></div>
          </div>
        </div>
        <div className="m-line"/>
        <div className="m-tree-gen m-gen-4">
          <div className="m-leaf m-leaf-female m-leaf-self">
            <div className="m-leaf-av" style={{background:"#f0d4c8",color:"#8a3f2a"}}>HB</div>
            <div className="m-leaf-text"><div className="m-leaf-n">Helena <span className="m-self">você</span></div><div className="m-leaf-y">1985 –</div></div>
          </div>
        </div>
      </div>
      <div className="m-fab">
        <Icon name="plus" size={20}/>
      </div>
      <div className="m-tabbar">
        <div className="m-tab"><Icon name="home" size={20}/><span>Início</span></div>
        <div className="m-tab m-tab-on"><Icon name="tree" size={20}/><span>Árvore</span></div>
        <div className="m-tab"><Icon name="search" size={20}/><span>Pesquisa</span></div>
        <div className="m-tab"><Icon name="people" size={20}/><span>Pessoas</span></div>
      </div>
    </div>
  );
}

function MobileProfileScreen() {
  return (
    <div className="m-screen m-screen-profile">
      <div className="m-pbanner"/>
      <div className="m-pbar">
        <div className="m-back"><Icon name="chev-left" size={16}/></div>
        <div className="m-pbar-title">Perfil</div>
        <div className="m-back"><Icon name="share" size={16}/></div>
      </div>
      <div className="m-phead">
        <div className="m-pav">GB</div>
        <div className="m-ptags">
          <span className="m-pchip m-pchip-olive">Imigrante</span>
          <span className="m-pchip">Itália</span>
        </div>
        <div className="m-pname">Giuseppe <span>Bertolini</span></div>
        <div className="m-pmeta">1881 – 1958 · Marceneiro</div>
        <div className="m-pmeta-row">
          <span><Icon name="pin" size={11}/>Treviso, IT</span>
          <span><Icon name="calendar" size={11}/>77 anos</span>
        </div>
      </div>
      <div className="m-ptabs">
        <span className="m-ptab m-ptab-on">Bio</span>
        <span className="m-ptab">Família</span>
        <span className="m-ptab">Linha do tempo</span>
        <span className="m-ptab">Fotos</span>
      </div>
      <div className="m-pbody">
        <div className="m-card">
          <div className="m-card-eyebrow">Biografia</div>
          <p className="m-card-bio">Imigrou para o Brasil em 1903 a bordo do navio <em>Re Vittorio</em>. Estabeleceu uma marcenaria no bairro do Brás que ainda existe na família.</p>
        </div>
        <div className="m-card">
          <div className="m-card-eyebrow">Próximos eventos</div>
          <div className="m-tl">
            <div className="m-tl-row"><span className="m-tl-y">1881</span><span className="m-tl-d" style={{background:"#5b6e4f"}}/><span>Nascimento · Treviso</span></div>
            <div className="m-tl-row"><span className="m-tl-y">1903</span><span className="m-tl-d" style={{background:"#3a5b6b"}}/><span>Imigração · Porto de Santos</span></div>
            <div className="m-tl-row"><span className="m-tl-y">1905</span><span className="m-tl-d" style={{background:"#a08658"}}/><span>Casamento · Achiropita</span></div>
            <div className="m-tl-row"><span className="m-tl-y">1912</span><span className="m-tl-d" style={{background:"#5b6e4f"}}/><span>Filho Antônio nasce</span></div>
          </div>
        </div>
        <div className="m-card m-card-sug">
          <Icon name="sparkle" size={14}/>
          <div>
            <div className="m-sug-t">2 registros encontrados em arquivos italianos</div>
            <div className="m-sug-s">Tocar para revisar</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.MobileShowcase = MobileShowcase;
