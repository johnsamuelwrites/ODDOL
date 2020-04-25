import {MDCTopAppBar} from '@material/top-app-bar';
import {MDCDrawer} from "@material/drawer";
import {MDCTextField} from '@material/textfield';
import {MDCRipple} from '@material/ripple';
import {MDCChipSet} from '@material/chips';
import {MDCTabScroller} from '@material/tab-scroller';



const drawer = MDCDrawer.attachTo(document.querySelector('.mdc-drawer'));

const topAppBar = MDCTopAppBar.attachTo(document.getElementById('app-bar'));
topAppBar.setScrollTarget(document.getElementById('main-content'));
topAppBar.listen('MDCTopAppBar:nav', () => {
  drawer.open = !drawer.open;
});


// Function to search terms
function searchTerm(search) {
  if (search === "") {
    return null;
  }
  const language = 'en'
  const limit = 1 
  const format = 'json' 
  const url = wdk.searchEntities(search, language, limit, format)
  console.log(url);
  /*fetch(url)
    .then(res => res.json())
    .then(json => console.log(json));*/
}

const chipSetEl = document.querySelector('.mdc-chip-set');
const chipSet = new MDCChipSet(chipSetEl);


const fabRipple = new MDCRipple(document.querySelector('.mdc-fab'));

const textField = new MDCTextField(document.querySelector('.mdc-text-field'));

const tabScroller = new MDCTabScroller(document.querySelector('.mdc-tab-scroller'));
