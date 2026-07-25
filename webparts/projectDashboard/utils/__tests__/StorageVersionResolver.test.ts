import {
  buildListName,
  buildRepoName,
  getProjectWebUrl,
  getStorageEndpoint,
  parseWorkOrder,
  resolveStorageVersion,
} from '../StorageVersionResolver';
import { IProjectCatalogItem } from '../../../../models/IProjectService';

describe('StorageVersionResolver', () => {
  const baseProject: IProjectCatalogItem = {
    Title: '1003012-ED2-0026-04-H_Rev-A',
  };

  it('defaults to v1 when storageVersion is missing or invalid', () => {
    expect(resolveStorageVersion(baseProject)).toBe('v1');
    expect(resolveStorageVersion({
      ...baseProject,
      ProjectDetails: '{"WorkOrder":"10010001"}',
    })).toBe('v1');
    expect(resolveStorageVersion({
      ...baseProject,
      ProjectDetails: '{invalid-json}',
    })).toBe('v1');
  });

  it('resolves v2 only when ProjectDetails.storageVersion is v2', () => {
    expect(resolveStorageVersion({
      ...baseProject,
      ProjectDetails: '{"storageVersion":"v2","WorkOrder":"10010001"}',
    })).toBe('v2');
  });

  it('builds list and repo names directly from Title', () => {
    expect(buildListName(baseProject.Title)).toBe('1003012-ED2-0026-04-H_Rev-A-List');
    expect(buildRepoName(baseProject.Title)).toBe('1003012-ED2-0026-04-H_Rev-A-Evidence');
  });

  it('returns the correct v2 endpoints for staging and production', () => {
    expect(getProjectWebUrl('v2', 'https://ed2corp.sharepoint.com/sites/ED2-Team/SitePages/Inbounds.aspx'))
      .toBe('https://ed2corp.sharepoint.com/sites/ED2-Team/WO-Plans');
    expect(getProjectWebUrl('v2', 'https://ed2corp.sharepoint.com/SitePages/Inbounds.aspx'))
      .toBe('https://ed2corp.sharepoint.com/WO-Plans');

    expect(getStorageEndpoint('v2', '/sites/ED2-Team').siteRelPath)
      .toBe('/sites/ED2-Team/WO-Plans');
    expect(getStorageEndpoint('v2', '/').siteRelPath)
      .toBe('/WO-Plans');
  });

  it('keeps v1 bound to the current site path and extracts WorkOrder safely', () => {
    const endpoint = getStorageEndpoint('v1', '/sites/ED2-Team');
    expect(endpoint.siteRelPath).toBe('/sites/ED2-Team');
    expect(endpoint.evidenceLibrary).toBe('ProjectsEvidence');

    expect(parseWorkOrder({
      ...baseProject,
      ProjectDetails: '{"WorkOrder":" 10010001 "}',
    })).toBe('10010001');
    expect(parseWorkOrder(baseProject)).toBeUndefined();
  });
});
